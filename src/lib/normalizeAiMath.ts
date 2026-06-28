// ---------------------------------------------------------------------------
// AI math auto-delimiter (the "bare LaTeX" safety net).
//
// The AI tutor/challenge models are instructed to wrap every math token in
// `$...$`, but they intermittently emit BARE LaTeX with NO delimiters — e.g. a
// challenge prompt arrives as `Evaluate lim_{x\to 4}\dfrac{x^2-16}{x-4}.` (often
// dropping the leading backslash on `\lim`, and frequently with INTERNAL SPACES
// like `\lim_{x \to 4} f(x)` or `\int_0^1 x^2 \, dx`). The robust MathText parser
// only renders text INSIDE delimiters, so undelimited LaTeX leaks to the screen
// as raw source.
//
// normalizeAiMath is a conservative pass applied ONLY to AI-GENERATED content in
// src/lib/ai.ts (never authored lesson/bank content, which is already correctly
// delimited). It:
//   • strips un-renderable control characters first, so KaTeX never receives a
//     stray byte that shows as a "tofu"/no-glyph box;
//   • leaves every ALREADY-delimited span untouched — `$...$`, `$$...$$`,
//     `\(...\)`, `\[...\]`, and escaped `\$` currency — so nothing is double-
//     wrapped and no stray `$` is introduced;
//   • wraps each maximal CONTIGUOUS LaTeX RUN in `$...$`, where a run is found by
//     a left-to-right scanner that extends through `\commands`, balanced braces
//     (even braces containing spaces, e.g. `_{x \to 4}`), sub/superscripts,
//     numbers, operators, single-letter variables, AND the spaces BETWEEN such
//     math tokens — stopping only when ordinary prose resumes. It never emits an
//     unbalanced-brace fragment.
//   • restores backslash-stripped commands and canonicalizes literal Unicode
//     Greek (restoreMathCommands) WITHIN each delimited span and wrapped run — so
//     a `$delta$`/`$frac{ε}{7}$` whose backslash the transport dropped renders as
//     real δ / a real fraction instead of italic "delta"/"fracε7". This runs only
//     on confirmed-math substrings, never free prose.
// The result is fed straight into MathText, whose parser renders the now-
// properly-delimited math. MathText itself is unchanged.
// ---------------------------------------------------------------------------

// Sentence punctuation that should stay OUTSIDE the wrapped math when it trails a
// run (so `\frac{5}{n}.` becomes `$\frac{5}{n}$.`, not `$\frac{5}{n}.$`).
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

// Single chars that legitimately follow a backslash as a (non-letter) control
// sequence inside math — spacing (`\,` `\;` `\!`), escaped braces/pipes, and the
// `\\` line break. NOT `(`, `[`, or `$`: those are delimiter starts handled
// elsewhere, so a run must stop before them.
const MATH_BACKSLASH_PUNCT = new Set([',', ';', '!', ':', '>', '{', '}', '|', '\\', "'"]);

// Bare operator/grouping chars that can appear inside a math run.
const MATH_OPERATORS = new Set([
  '+', '-', '*', '/', '=', '<', '>', '|', '(', ')', '[', ']', ',', '.', '!', "'", ':', ';', '~',
]);

// Multi-letter words that count as math when a run extends across a space into
// them (so `\, dx` and `\sin x` stay one run). Function names usually arrive as
// `\sin` etc.; this is a safety net for the bare forms.
const MATH_WORDS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh',
  'arcsin', 'arccos', 'arctan', 'log', 'ln', 'exp', 'lim', 'limsup', 'liminf',
  'max', 'min', 'sup', 'inf', 'det', 'dim', 'ker', 'arg', 'deg', 'gcd', 'mod',
]);

function isAsciiLetter(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/** Spaces that may appear WITHIN a math run. Newlines deliberately END a run
 * (inline math never crosses a line, matching MathText). */
function isInlineSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\f' || ch === '\v';
}

/** A 2-letter differential like `dx`, `dy`, `dt` (a `d` + one variable letter). */
function isDifferential(word: string): boolean {
  return word.length === 2 && (word[0] === 'd' || word[0] === 'D') && isAsciiLetter(word[1]);
}

/** End index (exclusive) of the contiguous ASCII-letter run at `i`. */
function letterRunEnd(text: string, i: number): number {
  let j = i;
  while (j < text.length && isAsciiLetter(text[j])) {
    j += 1;
  }
  return j;
}

/** End index (exclusive) of the contiguous ASCII letters+digits run at `i`. */
function alnumRunEnd(text: string, i: number): number {
  let j = i;
  while (j < text.length && (isAsciiLetter(text[j]) || isDigit(text[j]))) {
    j += 1;
  }
  return j;
}

/** Index AFTER the `}` matching the `{` at `open`, or -1 when unbalanced. */
function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (c === '{') {
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  return -1;
}

function bracesBalanced(s: string): boolean {
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '{') {
      depth += 1;
    } else if (s[i] === '}') {
      depth -= 1;
      if (depth < 0) {
        return false;
      }
    }
  }
  return depth === 0;
}

// ---------------------------------------------------------------------------
// Backslash-stripped command restoration (the "frace7"/bare-word bug).
//
// Distinct from the control-char corruption: the OpenAI strict-JSON transport
// sometimes drops a LaTeX command's backslash ENTIRELY rather than collapsing it
// to a control char. `\delta` arrives as the bare word "delta", `\frac{...}` as
// "frac{...}", `\varepsilon` as "varepsilon" — with NO control char to map back.
// KaTeX then renders the bare letters as italic text (e.g. "frac{ε}{7}" ->
// "fracε7"), producing NO .katex-error and NO tofu, so the older detectors miss
// it. The model also sometimes emits a literal Unicode Greek glyph instead of a
// command; KaTeX renders those fine, which is why SOME Greek looked correct in
// the same question while the backslash-dropped ones broke.
//
// restoreMathCommands runs ONLY on text already known to be MATH (inside a
// delimiter or an auto-wrapped run), never on free prose, so an ordinary English
// "delta"/"sum"/"to" in a sentence is never corrupted. Mirror of the server's
// functions/src/latexSanitize.ts (kept in sync).
// ---------------------------------------------------------------------------

// Multi-letter LaTeX command names that, with the leading backslash stripped,
// survive as ordinary words. Restored only inside math context. Intentionally
// EXCLUDES text-mode commands (\text, …) — those are handled separately so their
// literal-text arguments are never "restored".
const KNOWN_MATH_COMMANDS = new Set<string>([
  // greek (lowercase + variants)
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta',
  'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron',
  'pi', 'varpi', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi',
  'varphi', 'chi', 'psi', 'omega',
  // greek (uppercase)
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi',
  'Psi', 'Omega',
  // fractions / roots / big operators
  'frac', 'dfrac', 'tfrac', 'cfrac', 'sqrt', 'sum', 'prod', 'coprod', 'int',
  'iint', 'iiint', 'oint', 'lim', 'limsup', 'liminf', 'inf', 'sup',
  // symbols / relations / arrows
  'infty', 'partial', 'nabla', 'cdot', 'cdots', 'ldots', 'dots', 'vdots',
  'times', 'div', 'pm', 'mp', 'ast', 'star', 'circ', 'bullet', 'oplus',
  'ominus', 'otimes', 'odot', 'leq', 'geq', 'le', 'ge', 'neq', 'ne', 'approx',
  'equiv', 'sim', 'simeq', 'cong', 'propto', 'asymp', 'doteq', 'll', 'gg',
  'to', 'gets', 'mapsto', 'rightarrow', 'leftarrow', 'longrightarrow',
  'longleftarrow', 'leftrightarrow', 'Rightarrow', 'Leftarrow',
  'Leftrightarrow', 'implies', 'iff', 'in', 'notin', 'ni', 'subset',
  'subseteq', 'supset', 'supseteq', 'cup', 'cap', 'setminus', 'emptyset',
  'varnothing', 'forall', 'exists', 'nexists', 'neg', 'lnot', 'land', 'lor',
  'wedge', 'vee', 'angle', 'perp', 'parallel', 'cong',
  // delimiters / accents (math-mode)
  'left', 'right', 'lfloor', 'rfloor', 'lceil', 'rceil', 'langle', 'rangle',
  'vec', 'hat', 'bar', 'tilde', 'dot', 'ddot', 'overline', 'underline',
  'overrightarrow', 'widehat', 'widetilde', 'boldsymbol',
  'mathbb', 'mathcal', 'mathfrak', 'mathrm', 'mathbf', 'mathit', 'mathsf',
  // named functions / operators
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'coth',
  'arcsin', 'arccos', 'arctan', 'log', 'ln', 'lg', 'exp', 'deg', 'det', 'dim',
  'ker', 'hom', 'arg', 'gcd', 'min', 'max', 'bmod', 'pmod',
  // spacing word
  'quad', 'qquad',
]);

// Text-mode commands whose brace argument is LITERAL text: command names inside
// must NOT be restored (e.g. `\text{5 to 10}` must keep "to", not become `\to`).
const TEXT_MODE_COMMANDS = new Set<string>([
  'text', 'textrm', 'textbf', 'textit', 'textsf', 'texttt', 'textnormal',
  'textsc', 'mbox', 'hbox', 'operatorname',
]);

// Literal Unicode Greek (and lookalike) glyphs mapped to their canonical KaTeX
// command. KaTeX already renders these directly, but canonicalizing keeps output
// uniform (e.g. a fraction numerator that arrived as a glyph) and robust across
// fonts/KaTeX versions. Applied only inside math context.
const UNICODE_GREEK_TO_COMMAND: Record<string, string> = {
  '\u03B1': '\\alpha', '\u03B2': '\\beta', '\u03B3': '\\gamma', '\u03B4': '\\delta',
  '\u03B5': '\\varepsilon', '\u03F5': '\\epsilon', '\u03B6': '\\zeta', '\u03B7': '\\eta',
  '\u03B8': '\\theta', '\u03D1': '\\vartheta', '\u03B9': '\\iota', '\u03BA': '\\kappa',
  '\u03BB': '\\lambda', '\u03BC': '\\mu', '\u03BD': '\\nu', '\u03BE': '\\xi',
  '\u03C0': '\\pi', '\u03D6': '\\varpi', '\u03C1': '\\rho', '\u03F1': '\\varrho',
  '\u03C3': '\\sigma', '\u03C2': '\\varsigma', '\u03C4': '\\tau', '\u03C5': '\\upsilon',
  '\u03C6': '\\varphi', '\u03D5': '\\phi', '\u03C7': '\\chi', '\u03C8': '\\psi',
  '\u03C9': '\\omega',
  '\u0393': '\\Gamma', '\u0394': '\\Delta', '\u0398': '\\Theta', '\u039B': '\\Lambda',
  '\u039E': '\\Xi', '\u03A0': '\\Pi', '\u03A3': '\\Sigma', '\u03A5': '\\Upsilon',
  '\u03A6': '\\Phi', '\u03A8': '\\Psi', '\u03A9': '\\Omega',
};

/**
 * Restores backslash-stripped LaTeX commands and canonicalizes literal Unicode
 * Greek WITHIN a string already known to be math (a delimited span or wrapped
 * run). Existing `\commands` are preserved verbatim; a text-mode command's brace
 * argument is copied untouched so its literal text is never corrupted. Idempotent
 * on already-correct math.
 */
function restoreMathCommands(s: string): string {
  if (!s) {
    return s;
  }
  let out = '';
  let i = 0;
  const n = s.length;

  while (i < n) {
    const ch = s[i];

    // Existing backslash sequence: copy the command (or escaped char) verbatim.
    if (ch === '\\') {
      const nx = s[i + 1] ?? '';
      if (isAsciiLetter(nx)) {
        const end = letterRunEnd(s, i + 1);
        const name = s.slice(i + 1, end);
        out += s.slice(i, end); // `\command`
        i = end;
        // For text-mode commands, copy the literal-text brace argument verbatim
        // (skipping any inter-token spaces) so command names there aren't touched.
        if (TEXT_MODE_COMMANDS.has(name)) {
          let j = i;
          while (j < n && (s[j] === ' ' || s[j] === '\t')) {
            j += 1;
          }
          if (s[j] === '{') {
            const close = matchBrace(s, j);
            if (close !== -1) {
              out += s.slice(i, close);
              i = close;
            }
          }
        }
        continue;
      }
      out += s.slice(i, i + 2); // `\,` `\{` `\\` etc.
      i += 2;
      continue;
    }

    // Literal Unicode Greek -> canonical command.
    const greek = UNICODE_GREEK_TO_COMMAND[ch];
    if (greek) {
      out += greek;
      // A trailing ASCII letter would glue onto the command (`\varepsilonx`); a
      // single space keeps them separate (math-mode spaces are non-significant).
      if (isAsciiLetter(s[i + 1] ?? '')) {
        out += ' ';
      }
      i += 1;
      continue;
    }

    // Bare command name (backslash stripped in transport) -> restore backslash.
    if (isAsciiLetter(ch)) {
      const end = letterRunEnd(s, i);
      const word = s.slice(i, end);
      out += KNOWN_MATH_COMMANDS.has(word) ? `\\${word}` : word;
      i = end;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/**
 * True when a NEW math run may begin at `i`: either a `\letter` command, or an
 * identifier/number immediately followed by a REAL sub/superscript signal —
 * `_{`/`^{` (braced), `^` + alnum (power), or `_` + digit (numeric subscript).
 * Deliberately NOT `_` + letter, so snake_case identifiers never start a run.
 */
function runStartsAt(text: string, i: number): boolean {
  const c = text[i];
  if (c === '\\') {
    return isAsciiLetter(text[i + 1] ?? '');
  }
  if (isAsciiLetter(c) || isDigit(c)) {
    const end = alnumRunEnd(text, i);
    const a = text[end] ?? '';
    const b = text[end + 1] ?? '';
    if ((a === '_' || a === '^') && b === '{') {
      return true;
    }
    if (a === '^' && (isAsciiLetter(b) || isDigit(b))) {
      return true;
    }
    if (a === '_' && isDigit(b)) {
      return true;
    }
  }
  return false;
}

/**
 * After a space inside a run, decides whether the math continues with the token
 * at `k` (include the space) or prose resumes (end the run). Math continues for a
 * `\command`/spacing, a brace/sub/superscript, a digit, an operator, a single-
 * letter variable, a known math word, a differential, or an identifier carrying a
 * real sub/superscript signal. A plain multi-letter English word ends the run.
 */
function continuesRun(text: string, k: number): boolean {
  if (k >= text.length) {
    return false;
  }
  const c = text[k];
  if (c === '$') {
    return false;
  }
  if (c === '\\') {
    const nx = text[k + 1] ?? '';
    if (nx === '$') {
      return false;
    }
    return isAsciiLetter(nx) || MATH_BACKSLASH_PUNCT.has(nx);
  }
  if (c === '{' || c === '_' || c === '^') {
    return true;
  }
  if (isDigit(c) || MATH_OPERATORS.has(c)) {
    return true;
  }
  if (isAsciiLetter(c)) {
    const end = letterRunEnd(text, k);
    const word = text.slice(k, end);
    if (word.length === 1) {
      return true;
    }
    if (MATH_WORDS.has(word.toLowerCase()) || isDifferential(word)) {
      return true;
    }
    const a = text[end] ?? '';
    const b = text[end + 1] ?? '';
    if ((a === '_' || a === '^') && b === '{') {
      return true;
    }
    if (a === '^' && (isAsciiLetter(b) || isDigit(b))) {
      return true;
    }
    if (a === '_' && isDigit(b)) {
      return true;
    }
  }
  return false;
}

/**
 * Consumes the maximal math run starting at `start`. Extends through commands,
 * balanced brace groups (incl. internal spaces), sub/superscripts and their
 * arguments, numbers, operators, identifiers, and the spaces BETWEEN math tokens
 * (gated by {@link continuesRun}). Stops at a `$`, a newline, an unbalanced `{`,
 * or where prose resumes. Returns the end index and whether a STRONG signal (a
 * `\letter` command or a `_`/`^` script) was seen.
 */
function consumeMathRun(text: string, start: number): { end: number; strong: boolean } {
  let i = start;
  let strong = false;
  const n = text.length;

  while (i < n) {
    const c = text[i];

    if (c === '$') {
      break;
    }

    if (c === '\\') {
      const nx = text[i + 1] ?? '';
      if (nx === '$') {
        break; // escaped currency — leave it for prose/MathText
      }
      if (isAsciiLetter(nx)) {
        i = letterRunEnd(text, i + 1); // \command
        strong = true;
        continue;
      }
      if (nx && nx !== '\n' && nx !== '\r' && !isInlineSpace(nx)) {
        i += 2; // \,  \;  \{  \\  etc.
        continue;
      }
      break;
    }

    if (c === '{') {
      const close = matchBrace(text, i);
      if (close === -1) {
        break; // unbalanced — never wrap a broken brace fragment
      }
      i = close;
      continue;
    }

    if (c === '_' || c === '^') {
      strong = true;
      i += 1;
      const a = text[i] ?? '';
      if (a === '{') {
        const close = matchBrace(text, i);
        if (close === -1) {
          i -= 1; // drop the dangling script; stop the run cleanly
          break;
        }
        i = close;
      } else if (a === '\\') {
        const nx = text[i + 1] ?? '';
        if (isAsciiLetter(nx)) {
          i = letterRunEnd(text, i + 1);
        } else if (nx && !isInlineSpace(nx) && nx !== '\n' && nx !== '\r') {
          i += 2;
        }
      } else if (isAsciiLetter(a) || isDigit(a)) {
        i += 1;
      }
      continue;
    }

    if (isDigit(c)) {
      while (i < n && (isDigit(text[i]) || (text[i] === '.' && isDigit(text[i + 1] ?? '')))) {
        i += 1;
      }
      continue;
    }

    if (isAsciiLetter(c)) {
      i = letterRunEnd(text, i);
      continue;
    }

    if (MATH_OPERATORS.has(c)) {
      i += 1;
      continue;
    }

    if (isInlineSpace(c)) {
      let k = i;
      while (k < n && isInlineSpace(text[k])) {
        k += 1;
      }
      if (continuesRun(text, k)) {
        i = k;
        continue;
      }
      break; // trailing/inter-prose space — the run ends before it
    }

    break; // newline or any other char ends the run
  }

  return { end: i, strong };
}

/**
 * Auto-delimits the UNDELIMITED prose between already-delimited spans by wrapping
 * each maximal contiguous LaTeX run (found by the left-to-right scanner) in
 * `$...$`. A region that already contains a `$` (stray/unbalanced or escaped
 * currency `\$`) is left verbatim, so we never place a `$` next to an existing
 * one (which could mis-pair and swallow prose). Trailing sentence punctuation
 * stays outside the wrap.
 */
function autoDelimitProse(text: string): string {
  if (text.includes('$')) {
    return text;
  }

  let out = '';
  let i = 0;
  const n = text.length;

  while (i < n) {
    if (runStartsAt(text, i)) {
      const { end, strong } = consumeMathRun(text, i);
      if (strong && end > i) {
        const runText = text.slice(i, end);
        const trailingMatch = runText.match(TRAILING_PUNCTUATION);
        const trailing = trailingMatch ? trailingMatch[0] : '';
        const core = trailing ? runText.slice(0, runText.length - trailing.length) : runText;
        if (core && bracesBalanced(core)) {
          // Restore any backslash-stripped commands / Unicode Greek now that the
          // run is confirmed math (restoration only adds backslashes / maps
          // glyphs, so the brace balance just checked is preserved).
          out += `$${restoreMathCommands(core)}$${trailing}`;
          i = end;
          continue;
        }
      }
    }
    out += text[i];
    i += 1;
  }

  return out;
}

/**
 * Finds the next UNESCAPED single `$` on the same line as the opener (the closer
 * of an inline `$...$` span), or -1 if it is never closed before a newline / the
 * end. Mirrors MathText's scanner so a span this function treats as "already
 * delimited" is exactly what MathText will later render as math.
 */
function findInlineDollarClose(text: string, from: number): number {
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\n') {
      return -1;
    }
    if (ch === '\\') {
      i += 1; // skip the escaped char
      continue;
    }
    if (ch === '$') {
      return i;
    }
  }
  return -1;
}

/**
 * Removes EVERY code point KaTeX cannot render — the ones that surface as
 * "tofu"/no-glyph boxes: residual C0 controls (except tab/newline/CR), DEL + C1
 * controls, the Unicode REPLACEMENT character U+FFFD (what a dropped command
 * collapses to and the actual culprit behind the δ/ε tofu boxes), the
 * non-characters U+FFFE/U+FFFF, and lone surrogates. Valid astral characters
 * (surrogate PAIRS) are preserved because iteration is by code point.
 *
 * In production this runs AFTER repairLatexEscapes (see cleanAiMathText in
 * ai.ts), which has already restored genuine mangled-backslash control chars to
 * real commands — so this only sweeps up whatever is left, GUARANTEEING nothing
 * un-renderable ever reaches KaTeX.
 */
function stripControlChars(text: string): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d) {
      out += ch; // keep ordinary whitespace
      continue;
    }
    if (cp <= 0x1f) continue; // other C0 controls
    if (cp >= 0x7f && cp <= 0x9f) continue; // DEL + C1 controls
    if (cp >= 0xd800 && cp <= 0xdfff) continue; // lone surrogate code unit
    if (cp === 0xfffd || cp === 0xfffe || cp === 0xffff) continue; // replacement + non-chars
    out += ch;
  }
  return out;
}

/**
 * Normalizes AI-generated text so undelimited LaTeX still renders. Already-
 * delimited math (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`) and escaped `\$`
 * currency are copied verbatim; only the prose BETWEEN those spans is scanned
 * for bare LaTeX runs to wrap. Idempotent: running it on already-normalized (or
 * already-correctly-delimited) text returns the same string.
 */
export function normalizeAiMath(text: string): string {
  if (!text) {
    return text;
  }

  const src = stripControlChars(text);

  // Fast path: with no backslash, sub/superscript, OR dollar anywhere there is no
  // LaTeX to wrap, no delimiter to protect, and no math span whose backslash-
  // stripped commands need restoring, so the text is returned untouched. (A `$`
  // is included because a `$delta$` span carries no `\ _ ^` yet still needs
  // restoration.) Undelimited Unicode Greek in plain prose is left as-is.
  if (!/[\\_^$]/.test(src)) {
    return src;
  }

  let out = '';
  let prose = '';
  let i = 0;
  const n = src.length;

  const flushProse = () => {
    if (prose.length > 0) {
      out += autoDelimitProse(prose);
      prose = '';
    }
  };

  while (i < n) {
    const ch = src[i];
    const next = i + 1 < n ? src[i + 1] : '';

    // Escaped dollar -> literal currency; keep verbatim, never a delimiter.
    if (ch === '\\' && next === '$') {
      prose += '\\$';
      i += 2;
      continue;
    }

    // Display math \[ ... \] — protected only when properly closed. The inner
    // content is still restored (backslash-stripped commands / Unicode Greek).
    if (ch === '\\' && next === '[') {
      const close = src.indexOf('\\]', i + 2);
      if (close !== -1) {
        flushProse();
        out += `\\[${restoreMathCommands(src.slice(i + 2, close))}\\]`;
        i = close + 2;
        continue;
      }
      prose += '\\[';
      i += 2;
      continue;
    }

    // Inline math \( ... \) — protected only when properly closed.
    if (ch === '\\' && next === '(') {
      const close = src.indexOf('\\)', i + 2);
      if (close !== -1) {
        flushProse();
        out += `\\(${restoreMathCommands(src.slice(i + 2, close))}\\)`;
        i = close + 2;
        continue;
      }
      prose += '\\(';
      i += 2;
      continue;
    }

    // Display math $$ ... $$ — protected only when properly closed.
    if (ch === '$' && next === '$') {
      const close = src.indexOf('$$', i + 2);
      if (close !== -1) {
        flushProse();
        out += `$$${restoreMathCommands(src.slice(i + 2, close))}$$`;
        i = close + 2;
        continue;
      }
      prose += '$$';
      i += 2;
      continue;
    }

    // Inline math $ ... $ — protected only when properly paired on one line.
    if (ch === '$') {
      const close = findInlineDollarClose(src, i + 1);
      if (close !== -1) {
        flushProse();
        out += `$${restoreMathCommands(src.slice(i + 1, close))}$`;
        i = close + 1;
        continue;
      }
      prose += '$';
      i += 1;
      continue;
    }

    prose += ch;
    i += 1;
  }

  flushProse();
  return out;
}
