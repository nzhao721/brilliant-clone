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

/*
 * Supported delimiters (paired by parseMathText, not a global regex): `$$..$$`
 * and `\[..\]` (display), `\(..\)` and `$..$` (inline). Explicit pairing stops a
 * stray dollar from flipping the rest of the string.
 */

/*
 * Operators whose scripts should stack under/over them. KaTeX only stacks these
 * in display style, so we inject `\limits` to force it inline too. Longer names
 * precede prefixes (e.g. `limsup` before `lim`) so alternation matches whole tokens.
 */
const LIMITS_OPERATORS = [
  'varlimsup',
  'varliminf',
  'limsup',
  'liminf',
  'lim',
  'argmax',
  'argmin',
  'sup',
  'inf',
  'max',
  'min',
  'det',
  'gcd',
] as const;

/*
 * Matches `\<op>` (a complete control word via `(?![a-zA-Z])`) followed by a
 * sub/superscript. Operators already carrying `\limits`/`\nolimits` don't match
 * (a `\` follows, not `_`/`^`), so we never double-inject.
 */
const LIMITS_INJECT_PATTERN = new RegExp(
  `\\\\(${LIMITS_OPERATORS.join('|')})(?![a-zA-Z])(\\s*)([_^])`,
  'g',
);

/**
 * Rewrites `\lim_{x\to a}` → `\lim\limits_{x\to a}` (and the rest of the family)
 * so scripts stack in every style. Pure transform, run before KaTeX.
 */
export function stackLimitOperators(latex: string): string {
  return latex.replace(LIMITS_INJECT_PATTERN, '\\$1\\limits$2$3');
}

/* Cache by display-mode + source so the same formula isn't re-rendered. */
const renderCache = new Map<string, string>();

function renderMath(value: string, display: boolean): string {
  const cacheKey = `${display ? 'b' : 'i'}:${value}`;
  const cached = renderCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  /* Stack limit-operator scripts (inline KaTeX otherwise puts them beside). */
  const prepared = stackLimitOperators(value);

  /* throwOnError:false renders a bad formula in errorColor instead of crashing.
     Call KaTeX directly (not react-katex) for clean ESM bundling. */
  const html = katex.renderToString(prepared, {
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
 * Finds the next unescaped `$` on the opener's line (the `$...$` closer), or -1 if
 * none before a newline/end. `\$` is a literal dollar; inline math never crosses a line.
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
 * Splits text into text/math segments, pairing each opener with its real closer:
 * only properly-paired delimiters become math, an unmatched opener stays literal
 * (no cascade), and `\$` is a literal dollar. Supports `$..$`, `$$..$$`, `\(..\)`, `\[..\]`.
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

    /* Escaped dollar -> literal `$` (handled first so "\$5" never starts math). */
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
