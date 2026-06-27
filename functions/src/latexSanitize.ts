/*
 * Thin LaTeX validator/fallback for AI-generated text. The model returns reliable
 * math (Structured Outputs + doubled backslashes), so this no longer RECOVERS
 * mangled commands. It's a safety net: walk MathText's delimiters
 * (`$$...$$`, `\[...\]`, `\(...\)`, `$...$`) and ask KaTeX whether each span
 * renders — kept verbatim if so, else downgraded to plain text (`$` escaped).
 * Prose and escaped `\$` are untouched.
 */

import katex from 'katex';

/**
 * Finds the next UNESCAPED single `$` on the opener's line (the inline `$...$`
 * closer), or -1 if it never closes. Mirrors MathText's scanner so math here
 * matches what the client renders.
 */
function findInlineDollarClose(text: string, from: number): number {
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\n') {
      return -1;
    }
    if (ch === '\\') {
      i += 1; // skip the escaped char so `\$` is not treated as the closer
      continue;
    }
    if (ch === '$') {
      return i;
    }
  }
  return -1;
}

/**
 * True when KaTeX can render `value`. Same options as MathText's renderer except
 * throwOnError is on, so a non-renderable span is detected here instead of in the UI.
 */
function isRenderable(value: string, display: boolean): boolean {
  try {
    katex.renderToString(value, { displayMode: display, throwOnError: true, strict: 'warn' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Plain-text fallback for a rejected math span: show its source with every `$`
 * escaped to `\$`, so no stray dollar can re-open a math span.
 */
function toPlainText(inner: string): string {
  return inner.replace(/\$/g, '\\$');
}

/**
 * Validates the LaTeX in one AI-generated field: each paired math span is kept
 * verbatim when KaTeX renders it, else downgraded to escaped plain text.
 * Everything else is copied unchanged. Idempotent on already-clean text.
 */
export function sanitizeAiLatex(value: string): string {
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

    // Display math: \[ ... \]
    if (ch === '\\' && next === '[') {
      const close = value.indexOf('\\]', i + 2);
      if (close !== -1) {
        const inner = value.slice(i + 2, close);
        out += isRenderable(inner, true) ? `\\[${inner}\\]` : toPlainText(inner);
        i = close + 2;
        continue;
      }
      out += '\\[';
      i += 2;
      continue;
    }

    // Inline math: \( ... \)
    if (ch === '\\' && next === '(') {
      const close = value.indexOf('\\)', i + 2);
      if (close !== -1) {
        const inner = value.slice(i + 2, close);
        out += isRenderable(inner, false) ? `\\(${inner}\\)` : toPlainText(inner);
        i = close + 2;
        continue;
      }
      out += '\\(';
      i += 2;
      continue;
    }

    // Display math: $$ ... $$
    if (ch === '$' && next === '$') {
      const close = value.indexOf('$$', i + 2);
      if (close !== -1) {
        const inner = value.slice(i + 2, close);
        out += isRenderable(inner, true) ? `$$${inner}$$` : toPlainText(inner);
        i = close + 2;
        continue;
      }
      out += '$$';
      i += 2;
      continue;
    }

    // Inline math: $ ... $ (single line, properly paired only)
    if (ch === '$') {
      const close = findInlineDollarClose(value, i + 1);
      if (close !== -1) {
        const inner = value.slice(i + 1, close);
        out += isRenderable(inner, false) ? `$${inner}$` : toPlainText(inner);
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
