import { Fragment } from 'react';
import katex from 'katex';
import {
  FormalDerivativeFormula,
  formalDerivativeFormulaToken,
} from './FormalDerivativeFormula';
import './MathText.css';

type MathSegment =
  | {
      kind: 'text';
      value: string;
    }
  | {
      kind: 'math';
      display: boolean;
      value: string;
    };

type MathTextProps = {
  text: string;
};

// Supported math delimiters, matched by the hand-written scanner in
// parseMathText (NOT a single global regex):
//   - `$$ ... $$`  block / display math
//   - `\[ ... \]`  block / display math
//   - `\( ... \)`  inline math
//   - `$ ... $`    inline math (single line)
//
// The scanner pairs delimiters explicitly so a stray, unbalanced, or escaped
// dollar can never "flip" the rest of the string between text and math (the
// AI-coach render bug). See parseMathText for the per-rule reasoning.

// KaTeX renders a given source string to identical markup every time, so cache
// by display-mode + source to avoid re-running the (relatively costly) renderer
// on every React re-render of the same formula.
const renderCache = new Map<string, string>();

function renderMath(value: string, display: boolean): string {
  const cacheKey = `${display ? 'b' : 'i'}:${value}`;
  const cached = renderCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // throwOnError:false keeps a single bad formula from crashing the lesson; the
  // offending source is shown in errorColor instead. We render through KaTeX
  // directly (rather than react-katex) so Vite/esbuild can bundle the ESM build
  // cleanly and macros like \dfrac register correctly.
  const html = katex.renderToString(value, {
    displayMode: display,
    throwOnError: false,
    strict: 'warn',
  });
  renderCache.set(cacheKey, html);
  return html;
}

function MathSegmentView({ value, display }: { value: string; display: boolean }) {
  const html = renderMath(value, display);

  return display ? (
    <div className="math-block" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span className="math-inline" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function renderTextSegment(value: string, segmentIndex: number) {
  const parts = value.split(formalDerivativeFormulaToken);

  return parts.map((part, partIndex) => (
    <Fragment key={`${segmentIndex}-text-${partIndex}`}>
      {part}
      {partIndex < parts.length - 1 ? <FormalDerivativeFormula /> : null}
    </Fragment>
  ));
}

/**
 * Finds the next UNESCAPED single `$` on the same line as the opener, i.e. the
 * closing delimiter of an inline `$...$` span. Returns its index, or -1 when the
 * span is never closed before a newline or the end of the string (so the opener
 * is left as literal text instead of swallowing the rest of the message).
 *
 * A backslash escapes the following character, so `\$` is skipped (it is a
 * literal dollar inside the math, not a closer) — mirroring LaTeX. Inline math
 * never crosses a line break, matching the previous `[^$\n]` behavior.
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
 * Splits a string into text/math segments by SCANNING left to right and pairing
 * each opening delimiter with its real closer, rather than alternating on every
 * `$` (the old regex). This is what makes AI replies render correctly:
 *
 *  - Only PROPERLY-PAIRED delimiters become math. An opener with no matching
 *    closer (a lone/unbalanced `$`, `\(`, `\[`, or `$$`) is emitted as literal
 *    text, so one stray dollar can no longer cascade-flip every following
 *    segment between prose and math.
 *  - `\$` is a LITERAL dollar (e.g. "it costs \$5"), never a delimiter.
 *  - `\( \)` / `\[ \]` (which the model sometimes emits) and `$$ ... $$` block
 *    math are all supported alongside inline `$ ... $`.
 *
 * For well-formed, balanced input (every lesson/practice string) this produces
 * exactly the same segmentation as before, so existing math rendering is
 * unchanged.
 */
function parseMathText(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let buffer = '';
  let i = 0;
  const n = text.length;

  const flushText = () => {
    if (buffer.length > 0) {
      segments.push({ kind: 'text', value: buffer });
      buffer = '';
    }
  };

  const pushMath = (value: string, display: boolean) => {
    flushText();
    segments.push({ kind: 'math', display, value });
  };

  while (i < n) {
    const ch = text[i];
    const next = i + 1 < n ? text[i + 1] : '';

    // Escaped dollar -> literal `$`. Handled first so currency like "\$5" never
    // starts a math span.
    if (ch === '\\' && next === '$') {
      buffer += '$';
      i += 2;
      continue;
    }

    // Display math: \[ ... \]
    if (ch === '\\' && next === '[') {
      const close = text.indexOf('\\]', i + 2);
      if (close !== -1) {
        pushMath(text.slice(i + 2, close), true);
        i = close + 2;
        continue;
      }
      buffer += '\\['; // unterminated -> literal, don't cascade
      i += 2;
      continue;
    }

    // Inline math: \( ... \)
    if (ch === '\\' && next === '(') {
      const close = text.indexOf('\\)', i + 2);
      if (close !== -1) {
        pushMath(text.slice(i + 2, close), false);
        i = close + 2;
        continue;
      }
      buffer += '\\('; // unterminated -> literal, don't cascade
      i += 2;
      continue;
    }

    // Display math: $$ ... $$
    if (ch === '$' && next === '$') {
      const close = text.indexOf('$$', i + 2);
      if (close !== -1) {
        pushMath(text.slice(i + 2, close), true);
        i = close + 2;
        continue;
      }
      buffer += '$$'; // unterminated -> literal, don't cascade
      i += 2;
      continue;
    }

    // Inline math: $ ... $ (single line, properly paired only)
    if (ch === '$') {
      const close = findInlineDollarClose(text, i + 1);
      if (close !== -1) {
        pushMath(text.slice(i + 1, close), false);
        i = close + 1;
        continue;
      }
      buffer += '$'; // stray/unbalanced -> literal, leave the rest as prose
      i += 1;
      continue;
    }

    buffer += ch;
    i += 1;
  }

  flushText();

  return segments.length > 0 ? segments : [{ kind: 'text', value: text }];
}

export function MathText({ text }: MathTextProps) {
  return (
    <>
      {parseMathText(text).map((segment, index) => {
        if (segment.kind === 'text') {
          return <Fragment key={`${index}-${segment.value}`}>{renderTextSegment(segment.value, index)}</Fragment>;
        }

        return (
          <MathSegmentView
            key={`${index}-${segment.value}`}
            value={segment.value}
            display={segment.display}
          />
        );
      })}
    </>
  );
}
