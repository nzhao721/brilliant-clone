// ---------------------------------------------------------------------------
// LaTeX repair + sanitize for OpenAI structured-output corruption.
//
// OpenAI strict outputs intermittently mis-escape a LaTeX command's backslash in
// the JSON string. The backslash can be lost in one of TWO ways:
//
//   (A) It collapses into a CONTROL CHAR (handled by repairLatexEscapes):
//       - C-style escapes `\a \b \t \v \f \r \n` consume their letter (e.g.
//         `\theta` -> TAB + "heta", `\nabla` -> LF + "abla");
//       - any other `\<letter>` is an invalid escape and collapses to U+0000
//         (NUL) with the command letters intact (e.g. `\delta` -> NUL + "delta").
//
//   (B) It is DROPPED ENTIRELY (handled by restoreCommandsInMath): under strict
//       constrained JSON decoding the model sometimes emits the command with NO
//       backslash at all, so `\delta` arrives as the bare word "delta",
//       `\frac{...}` as "frac{...}", `\varepsilon` as "varepsilon". There is no
//       control char to map back. KaTeX then renders the bare letters as italic
//       text ("frac{ε}{7}" -> "fracε7"), with NO error and NO tofu. The model
//       also sometimes emits a literal Unicode Greek glyph (δ/ε/ϵ) instead of a
//       command; KaTeX renders those fine — which is why SOME Greek looks correct
//       in the same question while the backslash-dropped commands break.
//
// Some pipelines also drop a command to U+FFFD or stray C0/C1 bytes (KaTeX tofu).
//
// `repairLatexEscapes` maps every recoverable control char back to its
// `\<command>`; `restoreCommandsInMath` restores backslash-stripped commands and
// canonicalizes Unicode Greek INSIDE math delimiters (never in prose);
// `stripNonRenderable` removes anything still un-renderable; and `sanitizeAiLatex`
// composes the three. Mirrored client-side as a safety net.
// ---------------------------------------------------------------------------

// Control char -> the backslash escape it was mangled from.
const CONTROL_TO_BACKSLASH: Record<string, string> = {
  '\u0000': '\\', // invalid escape (\d \e \l \s \c \i \m \o ...) -> NUL + letters
  '\u0007': '\\a', // \a  (\alpha, \approx, \arctan, \angle, \aleph, ...)
  '\u0008': '\\b', // \b  (\beta, \bar, \binom, \bmod, ...)
  '\u0009': '\\t', // \t  (\to, \theta, \times, \text, \tan, \tau, \top, ...)
  '\u000b': '\\v', // \v  (\vec, \varepsilon, \varphi, \vartheta, \vee, ...)
  '\u000c': '\\f', // \f  (\frac, \forall, \flat, ...)
  '\u000d': '\\r', // \r  (\rho, \rightarrow, \rangle, ...)
};

// KaTeX commands whose backslash is `\n`. The JSON `\n` escape ate the leading
// 'n', so the surviving body is the command WITHOUT it. We only restore `\n`
// when `n<body>` is a real command, so genuine newlines (followed by ordinary
// prose) are left as newlines and never corrupted into a broken `\n...` token.
const N_COMMAND_BODIES = new Set<string>([
  'abla', // \nabla
  'eq', 'eg', // \neq \neg
  'mid', 'shortmid', // \nmid \nshortmid
  'otin', // \notin
  'leq', 'geq', 'leqq', 'geqq', 'leqslant', 'geqslant', // \nleq \ngeq ...
  'subseteq', 'supseteq', 'subset', 'supset', // \nsubseteq ...
  'parallel', 'sim', 'cong', 'simeq', 'approx', 'equiv', // \nparallel \nsim ...
  'exists', // \nexists
  'rightarrow', 'leftarrow', 'leftrightarrow', // \nrightarrow ...
  'Rightarrow', 'Leftarrow', 'Leftrightarrow',
  'atural', // \natural
  'earrow', 'warrow', // \nearrow \nwarrow
  'vdash', 'Vdash', 'vDash', 'VDash', // \nvdash family
  'prec', 'succ', 'preceq', 'succeq', // \nprec \nsucc ...
]);

/**
 * Restores LaTeX commands whose backslashes collapsed into control chars (the
 * full `\a \b \f \n \r \t \v` C-escape set plus the NUL invalid-escape case).
 * Clean input passes through untouched.
 */
export function repairLatexEscapes(value: string): string {
  if (!value) {
    return value;
  }
  // `\n`-family: only restore LF + a recognized command body, so genuine newlines
  // (followed by ordinary prose) are left alone.
  let out = value.replace(/\u000A([a-zA-Z]+)/g, (match, body: string) =>
    N_COMMAND_BODIES.has(body) ? '\\n' + body : match,
  );
  // eslint-disable-next-line no-control-regex
  out = out.replace(/[\u0000\u0007\u0008\u0009\u000b\u000c\u000d]/g, (ch) => CONTROL_TO_BACKSLASH[ch] ?? ch);
  return out;
}

/**
 * Removes code points KaTeX can't render (tofu boxes): residual C0 controls
 * (except tab/newline/CR), DEL + C1 controls, U+FFFD, the U+FFFE/U+FFFF
 * non-characters, and lone surrogates. Astral chars (surrogate PAIRS) survive
 * because iteration is by code point.
 */
export function stripNonRenderable(value: string): string {
  if (!value) {
    return value;
  }
  let out = '';
  for (const ch of value) {
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

// ---------------------------------------------------------------------------
// Backslash-stripped command restoration (case (B) above).
//
// Mirror of src/lib/normalizeAiMath.ts `restoreMathCommands` (kept in sync). The
// restoration runs ONLY inside math delimiters (`$...$`, `$$...$$`, `\(...\)`,
// `\[...\]`), never on free prose, so an ordinary English "delta"/"sum"/"to" in a
// sentence is never corrupted.
// ---------------------------------------------------------------------------

// Multi-letter LaTeX command names that, with the leading backslash stripped,
// survive as ordinary words. Restored only inside math. Intentionally EXCLUDES
// text-mode commands (\text, …), whose literal-text arguments must be left alone.
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
  'wedge', 'vee', 'angle', 'perp', 'parallel',
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
// must NOT be restored (e.g. `\text{5 to 10}` keeps "to", never becomes `\to`).
const TEXT_MODE_COMMANDS = new Set<string>([
  'text', 'textrm', 'textbf', 'textit', 'textsf', 'texttt', 'textnormal',
  'textsc', 'mbox', 'hbox', 'operatorname',
]);

// Literal Unicode Greek (and lookalike) glyphs mapped to their canonical KaTeX
// command. Applied only inside math context.
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

function isAsciiLetter(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

/** End index (exclusive) of the contiguous ASCII-letter run at `i`. */
function letterRunEnd(text: string, i: number): number {
  let j = i;
  while (j < text.length && isAsciiLetter(text[j])) {
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

/**
 * Finds the next UNESCAPED single `$` on the same line as the opener (the closer
 * of an inline `$...$` span), or -1 if it never closes before a newline / the
 * end. Mirrors MathText's scanner so the span treated as math here is exactly
 * what the client will later render as math.
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
 * Restores backslash-stripped commands and canonicalizes literal Unicode Greek
 * WITHIN a string already known to be math. Existing `\commands` are preserved
 * verbatim; a text-mode command's brace argument is copied untouched so its
 * literal text is never corrupted. Idempotent on already-correct math.
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

    if (ch === '\\') {
      const nx = s[i + 1] ?? '';
      if (isAsciiLetter(nx)) {
        const end = letterRunEnd(s, i + 1);
        const name = s.slice(i + 1, end);
        out += s.slice(i, end); // `\command`
        i = end;
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

    const greek = UNICODE_GREEK_TO_COMMAND[ch];
    if (greek) {
      out += greek;
      if (isAsciiLetter(s[i + 1] ?? '')) {
        out += ' ';
      }
      i += 1;
      continue;
    }

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
 * Applies {@link restoreMathCommands} to the CONTENT of every properly-closed
 * math delimiter (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`) while copying prose
 * (and escaped `\$` currency) verbatim — so backslash-stripped commands are
 * restored without ever touching ordinary English words outside math.
 */
export function restoreCommandsInMath(value: string): string {
  if (!value) {
    return value;
  }
  let out = '';
  let i = 0;
  const n = value.length;

  while (i < n) {
    const ch = value[i];
    const next = i + 1 < n ? value[i + 1] : '';

    // Escaped dollar -> literal currency; never a delimiter.
    if (ch === '\\' && next === '$') {
      out += '\\$';
      i += 2;
      continue;
    }

    // Display math \[ ... \]
    if (ch === '\\' && next === '[') {
      const close = value.indexOf('\\]', i + 2);
      if (close !== -1) {
        out += `\\[${restoreMathCommands(value.slice(i + 2, close))}\\]`;
        i = close + 2;
        continue;
      }
      out += '\\[';
      i += 2;
      continue;
    }

    // Inline math \( ... \)
    if (ch === '\\' && next === '(') {
      const close = value.indexOf('\\)', i + 2);
      if (close !== -1) {
        out += `\\(${restoreMathCommands(value.slice(i + 2, close))}\\)`;
        i = close + 2;
        continue;
      }
      out += '\\(';
      i += 2;
      continue;
    }

    // Display math $$ ... $$
    if (ch === '$' && next === '$') {
      const close = value.indexOf('$$', i + 2);
      if (close !== -1) {
        out += `$$${restoreMathCommands(value.slice(i + 2, close))}$$`;
        i = close + 2;
        continue;
      }
      out += '$$';
      i += 2;
      continue;
    }

    // Inline math $ ... $
    if (ch === '$') {
      const close = findInlineDollarClose(value, i + 1);
      if (close !== -1) {
        out += `$${restoreMathCommands(value.slice(i + 1, close))}$`;
        i = close + 1;
        continue;
      }
      out += '$';
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/**
 * Full cleanup for one AI-generated text field, in the SAME order as the client's
 * normalizeAiMath pipeline: repair control-char-mangled command backslashes,
 * strip anything still non-renderable, then restore backslash-stripped commands
 * (and canonicalize Unicode Greek) inside math delimiters. Restoring last means it
 * always operates on fully-cleaned text.
 */
export function sanitizeAiLatex(value: string): string {
  return restoreCommandsInMath(stripNonRenderable(repairLatexEscapes(value)));
}
