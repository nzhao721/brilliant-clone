// ---------------------------------------------------------------------------
// AI math auto-delimiter (the "bare LaTeX" safety net).
//
// The AI tutor/challenge models are instructed to wrap every math token in
// `$...$`, but they intermittently emit BARE LaTeX with NO delimiters — e.g. a
// challenge prompt arrives as `Evaluate the limit \lim_{n\to\infty}\frac{5}{n}.`
// (sometimes even dropping the leading backslash: `lim_{...}`). The robust
// MathText parser only renders text that is INSIDE delimiters, so undelimited
// LaTeX leaks straight to the screen as raw source (the challenge-prompt bug).
//
// normalizeAiMath is a conservative pass applied ONLY to AI-GENERATED content in
// src/lib/ai.ts (never to authored lesson/bank content, which is already
// correctly delimited). It:
//   • leaves every ALREADY-delimited span untouched — `$...$`, `$$...$$`,
//     `\(...\)`, `\[...\]`, and escaped `\$` currency — so nothing is ever
//     double-wrapped;
//   • wraps ONLY contiguous, space-free runs of undelimited text that clearly
//     contain LaTeX (a `\command`, a braced sub/superscript `_{`/`^{`, a power
//     `x^2`, or a numeric subscript `a_1`) in `$...$`;
//   • leaves plain prose, currency like `$5`, and snake_case identifiers exactly
//     as-is.
// The result is fed straight into MathText, whose parser then renders the now
// properly-delimited math. MathText itself is unchanged.
// ---------------------------------------------------------------------------

// Sentence punctuation that should stay OUTSIDE the wrapped math when it trails a
// run (so `\frac{5}{n}.` becomes `$\frac{5}{n}$.`, not `$\frac{5}{n}.$`).
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

/**
 * True when a contiguous, space-free run clearly contains LaTeX worth wrapping:
 * a backslash control word (`\frac`, `\lim`, `\to`, `\infty`, `\sqrt`, `\sum`,
 * `\sin`, `\cos`, `\cdot`, `\left`, `\right`, `\pi`, `\theta`, …), a braced
 * sub/superscript (`x_{...}` / `x^{...}`), a superscript power (`x^2`, `e^x`), or
 * a numeric subscript (`a_1`). Deliberately conservative: a lone `_word`
 * (snake_case) is NOT a signal, so ordinary identifiers in prose are left alone.
 */
function hasLatexSignal(run: string): boolean {
  return (
    /\\[a-zA-Z]+/.test(run) ||
    /[_^]\{/.test(run) ||
    /\^[0-9A-Za-z]/.test(run) ||
    /_[0-9]/.test(run)
  );
}

/**
 * Wraps a single "word" (a contiguous, space-free run) in `$...$` when it
 * carries a LaTeX signal, keeping any trailing sentence punctuation outside the
 * delimiters. Words with no signal (ordinary prose) are returned unchanged.
 */
function wrapMathWord(word: string): string {
  // A run that already contains a `$` is part of existing (possibly malformed)
  // delimiting — NEVER re-wrap it. This is what keeps normalizeAiMath a true
  // identity on already-delimited content: it can never place a `$` next to an
  // existing one (creating a spurious `$$` display span that swallows the prose
  // between two real spans), emit a stray literal `$`, or double-wrap. Such
  // fragments are left exactly as-is for MathText's scanner to pair.
  if (word.includes('$')) {
    return word;
  }
  if (!hasLatexSignal(word)) {
    return word;
  }

  const trailingMatch = word.match(TRAILING_PUNCTUATION);
  const trailing = trailingMatch ? trailingMatch[0] : '';
  const core = trailing ? word.slice(0, word.length - trailing.length) : word;

  // Stripping trailing punctuation can never remove the LaTeX signal (a command,
  // `_{`/`^{`, power, or numeric subscript), so `core` is still real math; guard
  // only the degenerate all-punctuation case.
  if (!core) {
    return word;
  }

  return `$${core}$${trailing}`;
}

/** Whitespace test that also treats the LaTeX control-space chars as breaks. */
function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';
}

/**
 * Auto-delimits the UNDELIMITED prose between math spans. Splits the text into
 * whitespace and "words", where a word is a maximal run of non-space characters
 * — except spaces INSIDE balanced `{ }` groups stay part of the word (so
 * `\frac{a + b}{c}` is treated as one run). Each word that carries a LaTeX
 * signal is wrapped; everything else is preserved verbatim.
 */
function autoDelimitProse(text: string): string {
  let out = '';
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    if (isSpace(ch)) {
      out += ch;
      i += 1;
      continue;
    }

    // Consume one word: non-space chars; spaces inside balanced { } are kept.
    let j = i;
    let depth = 0;
    while (j < n) {
      const c = text[j];
      if (c === '{') {
        depth += 1;
      } else if (c === '}') {
        if (depth > 0) {
          depth -= 1;
        }
      } else if (depth === 0 && isSpace(c)) {
        break;
      }
      j += 1;
    }

    out += wrapMathWord(text.slice(i, j));
    i = j;
  }

  return out;
}

/**
 * Finds the next UNESCAPED single `$` on the same line as the opener (the closer
 * of an inline `$...$` span), or -1 if it is never closed before a newline / the
 * end. Mirrors MathText's scanner so a span this function treats as "already
 * delimited" is exactly what MathText will later render as math. A backslash
 * escapes the next char, so `\$` is not a closer.
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
 * Normalizes AI-generated text so undelimited LaTeX still renders. Already-
 * delimited math (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`) and escaped `\$`
 * currency are copied verbatim; only the prose BETWEEN those spans is scanned
 * for bare LaTeX runs to wrap. Idempotent: running it on already-normalized
 * (or already-correctly-delimited) text returns the same string.
 */
export function normalizeAiMath(text: string): string {
  if (!text) {
    return text;
  }

  // Fast path: with no backslash, subscript, or superscript anywhere there is no
  // LaTeX to wrap and no command delimiters to protect, so the text is returned
  // untouched. Currency like "$5" (no `\ _ ^`) is left exactly as the model sent
  // it.
  if (!/[\\_^]/.test(text)) {
    return text;
  }

  let out = '';
  let prose = '';
  let i = 0;
  const n = text.length;

  const flushProse = () => {
    if (prose.length > 0) {
      out += autoDelimitProse(prose);
      prose = '';
    }
  };

  while (i < n) {
    const ch = text[i];
    const next = i + 1 < n ? text[i + 1] : '';

    // Escaped dollar -> literal currency; keep verbatim, never a delimiter.
    if (ch === '\\' && next === '$') {
      prose += '\\$';
      i += 2;
      continue;
    }

    // Display math \[ ... \] — protected only when properly closed.
    if (ch === '\\' && next === '[') {
      const close = text.indexOf('\\]', i + 2);
      if (close !== -1) {
        flushProse();
        out += text.slice(i, close + 2);
        i = close + 2;
        continue;
      }
      prose += '\\[';
      i += 2;
      continue;
    }

    // Inline math \( ... \) — protected only when properly closed.
    if (ch === '\\' && next === '(') {
      const close = text.indexOf('\\)', i + 2);
      if (close !== -1) {
        flushProse();
        out += text.slice(i, close + 2);
        i = close + 2;
        continue;
      }
      prose += '\\(';
      i += 2;
      continue;
    }

    // Display math $$ ... $$ — protected only when properly closed.
    if (ch === '$' && next === '$') {
      const close = text.indexOf('$$', i + 2);
      if (close !== -1) {
        flushProse();
        out += text.slice(i, close + 2);
        i = close + 2;
        continue;
      }
      prose += '$$';
      i += 2;
      continue;
    }

    // Inline math $ ... $ — protected only when properly paired on one line.
    if (ch === '$') {
      const close = findInlineDollarClose(text, i + 1);
      if (close !== -1) {
        flushProse();
        out += text.slice(i, close + 1);
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
