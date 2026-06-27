import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MathText } from '../components/MathText';
import { normalizeAiMath } from './normalizeAiMath';

// The AI tutor/challenge models sometimes emit BARE LaTeX with no `$` delimiters
// (the challenge-prompt render bug). normalizeAiMath is the conservative safety
// net that auto-delimits that bare math while never touching already-delimited
// math, prose, or currency. These tests pin BOTH the transform (exact strings)
// and the end-to-end render through MathText (real KaTeX, no leaked source).

describe('normalizeAiMath (transform)', () => {
  it('wraps a fully bare prompt formula in $...$ (the reported bug)', () => {
    // Exactly the screenshot string: bare, and the model even dropped the `\` on
    // `lim`. The whole contiguous run is wrapped so KaTeX can render it.
    expect(normalizeAiMath('lim_{n\\to\\infty}\\frac{5}{n}')).toBe(
      '$lim_{n\\to\\infty}\\frac{5}{n}$',
    );
  });

  it('wraps bare math but keeps the surrounding prose and trailing period intact', () => {
    expect(normalizeAiMath('Evaluate the limit \\lim_{n\\to\\infty}\\frac{5}{n}.')).toBe(
      'Evaluate the limit $\\lim_{n\\to\\infty}\\frac{5}{n}$.',
    );
  });

  it('leaves already-delimited inline math untouched (never double-wraps)', () => {
    expect(normalizeAiMath('$\\frac{5}{n}$')).toBe('$\\frac{5}{n}$');
    expect(normalizeAiMath('$\\frac{5}{n}$')).not.toContain('$$');
  });

  it('leaves a mix of prose and already-delimited spans untouched', () => {
    const message = "Nice — the slope is $f'(x) = 2x$, and it only costs \\$5 to retry.";
    expect(normalizeAiMath(message)).toBe(message);
  });

  it('leaves block $$, \\(...\\), and \\[...\\] delimited math untouched', () => {
    expect(normalizeAiMath('Definition $$\\frac{a}{b}$$ shown.')).toBe(
      'Definition $$\\frac{a}{b}$$ shown.',
    );
    expect(normalizeAiMath('inline \\(c + d\\) and block \\[a^2 + b^2\\] too')).toBe(
      'inline \\(c + d\\) and block \\[a^2 + b^2\\] too',
    );
  });

  it('leaves plain prose with no math completely untouched', () => {
    const prose = 'The derivative measures the instantaneous rate of change.';
    expect(normalizeAiMath(prose)).toBe(prose);
  });

  it('does not break currency: a lone $5 and an escaped \\$5 stay literal', () => {
    expect(normalizeAiMath('$5')).toBe('$5');
    expect(normalizeAiMath('It costs \\$5 to retry.')).toBe('It costs \\$5 to retry.');
    expect(normalizeAiMath('You only pay $5 today')).toBe('You only pay $5 today');
  });

  it('does not wrap snake_case identifiers as math', () => {
    expect(normalizeAiMath('use the rate_of_change helper')).toBe(
      'use the rate_of_change helper',
    );
  });

  it('wraps bare power and braced sub/superscript runs', () => {
    expect(normalizeAiMath('compute x^2 here')).toBe('compute $x^2$ here');
    expect(normalizeAiMath('the term a_{n} grows')).toBe('the term $a_{n}$ grows');
  });

  it('handles spaces inside balanced braces as one math run', () => {
    expect(normalizeAiMath('\\frac{a + b}{c}')).toBe('$\\frac{a + b}{c}$');
  });

  it('wraps each of several bare runs and only the runs with a signal', () => {
    // `\infty` is math; `0` (no signal) stays prose.
    expect(normalizeAiMath('from 0 to \\infty')).toBe('from 0 to $\\infty$');
  });

  it('is idempotent (re-normalizing changes nothing)', () => {
    const cases = [
      'lim_{n\\to\\infty}\\frac{5}{n}',
      'Evaluate the limit \\lim_{n\\to\\infty}\\frac{5}{n}.',
      '$\\frac{5}{n}$',
      'The derivative measures the rate of change.',
      'It costs \\$5.',
    ];
    for (const input of cases) {
      const once = normalizeAiMath(input);
      expect(normalizeAiMath(once)).toBe(once);
    }
  });
});

describe('normalizeAiMath (rendered through MathText)', () => {
  it('renders normalized bare LaTeX as real KaTeX with no leaked source', () => {
    const { container } = render(
      <MathText text={normalizeAiMath('lim_{n\\to\\infty}\\frac{5}{n}')} />,
    );

    // Real fraction and no KaTeX error box. The raw backslash check targets the
    // VISIBLE .katex-html layer — KaTeX always embeds the TeX source in the
    // hidden MathML <annotation>, so container.textContent legitimately contains
    // it; what must never leak is the on-screen html (the regression to guard).
    expect(container.querySelector('.katex')).toBeInTheDocument();
    expect(container.querySelector('.mfrac')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    const visible = container.querySelector('.katex-html')?.textContent ?? '';
    expect(visible).not.toContain('\\frac');
    expect(visible).not.toContain('\\to');
    expect(visible).not.toContain('\\infty');
  });

  it('renders the mixed prompt: prose stays prose, the formula becomes KaTeX', () => {
    const { container } = render(
      <MathText text={normalizeAiMath('Evaluate the limit \\lim_{n\\to\\infty}\\frac{5}{n}.')} />,
    );

    expect(container.querySelectorAll('.math-inline')).toHaveLength(1);
    expect(container.querySelector('.mfrac')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('Evaluate the limit');
    // The prose words were not swallowed into the math span.
    const inline = container.querySelector('.math-inline');
    expect(inline?.textContent ?? '').not.toContain('Evaluate');
  });

  it('renders an already-delimited choice label the same (single math span)', () => {
    const { container } = render(<MathText text={normalizeAiMath('$\\frac{1}{5}$')} />);

    expect(container.querySelectorAll('.math-inline')).toHaveLength(1);
    expect(container.querySelector('.mfrac')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
  });

  it('keeps a currency $5 as literal text (no KaTeX) after normalization', () => {
    const { container } = render(<MathText text={normalizeAiMath('You only pay $5 today')} />);

    expect(container.querySelector('.katex')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('You only pay $5 today');
  });
});

// Regression for the δ/ε prompt bug: a prompt with SEVERAL already-correctly-
// delimited `$...$` spans separated by prose was being corrupted — two spans plus
// the prose between them ("guarantees") merged into one math run, with stray
// literal `$` left visible. The normalizer must treat already-delimited content as
// a true identity. KaTeX hides the TeX source in a MathML <annotation>, so the
// "no literal $" check counts `$` only in the VISIBLE text (KaTeX nodes removed).
describe('normalizeAiMath multi-span already-delimited input (δ/ε regression)', () => {
  const DELTA_EPSILON_PROMPT =
    'For $f(x) = 4x + 1$ near $x = 2$ (so $L = 9$), which choice of $\\delta$ guarantees ' +
    '$|f(x) - L| < \\varepsilon$?';

  /** Visible (on-screen) text with all KaTeX-rendered math removed, so any `$` it
   * still contains is a genuine literal dollar leaking into the prose. */
  function visibleProse(container: HTMLElement): string {
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.katex').forEach((el) => el.remove());
    return clone.textContent ?? '';
  }

  it('leaves the multi-span δ/ε prompt COMPLETELY unchanged (transform)', () => {
    expect(normalizeAiMath(DELTA_EPSILON_PROMPT)).toBe(DELTA_EPSILON_PROMPT);
  });

  it('is idempotent on the multi-span δ/ε prompt', () => {
    const once = normalizeAiMath(DELTA_EPSILON_PROMPT);
    expect(normalizeAiMath(once)).toBe(once);
  });

  it('renders the δ/ε prompt as five separate math spans with prose intact', () => {
    const { container } = render(<MathText text={normalizeAiMath(DELTA_EPSILON_PROMPT)} />);

    // Five distinct inline spans: f(x)=4x+1, x=2, L=9, \delta, |f(x)-L|<\varepsilon.
    expect(container.querySelectorAll('.math-inline')).toHaveLength(5);
    expect(container.querySelectorAll('.math-block')).toHaveLength(0);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();

    // The prose words survive as prose and are NOT absorbed into any math span.
    expect(container).toHaveTextContent('near');
    expect(container).toHaveTextContent('which choice of');
    expect(container).toHaveTextContent('guarantees');
    const spans = Array.from(container.querySelectorAll('.math-inline'));
    for (const span of spans) {
      expect(span.textContent ?? '').not.toContain('guarantees');
      expect(span.textContent ?? '').not.toContain('near');
    }

    // No stray literal `$` leaks into the visible prose.
    expect(visibleProse(container)).not.toContain('$');
  });

  it('leaves a minimal "$a$ word $b$" unchanged and renders two spans + prose', () => {
    expect(normalizeAiMath('$a$ word $b$')).toBe('$a$ word $b$');

    const { container } = render(<MathText text={normalizeAiMath('$a$ word $b$')} />);
    expect(container.querySelectorAll('.math-inline')).toHaveLength(2);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('word');
    // "word" is prose, not pulled into either math span.
    const spans = Array.from(container.querySelectorAll('.math-inline'));
    for (const span of spans) {
      expect(span.textContent ?? '').not.toContain('word');
    }
    expect(visibleProse(container)).not.toContain('$');
  });

  it('does not merge two ADJACENT already-delimited spans ($a$$b$)', () => {
    expect(normalizeAiMath('$a$$b$')).toBe('$a$$b$');

    const { container } = render(<MathText text={normalizeAiMath('$a$$b$')} />);
    expect(container.querySelectorAll('.math-inline')).toHaveLength(2);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(visibleProse(container)).not.toContain('$');
  });

  it('never amplifies a malformed stray-$ input: idempotent, no new $, no katex-error', () => {
    // A model slip with an extra/stray `$` near \delta used to make the normalizer
    // double-wrap (`$$$\delta$$ …`), inject literal `$`, and even emit a display
    // block + KaTeX error. Now it is a true no-op on such input (defers to
    // MathText) and never makes things worse.
    const malformed =
      'For $f(x) = 4x + 1$ near $x = 2$ (so $L = 9$), which choice of $$\\delta$ guarantees ' +
      '$|f(x) - L| < \\varepsilon$?';
    const out = normalizeAiMath(malformed);

    // Idempotent and introduces no NEW dollars beyond what the model already sent.
    expect(normalizeAiMath(out)).toBe(out);
    expect((out.match(/\$/g) || []).length).toBeLessThanOrEqual(
      (malformed.match(/\$/g) || []).length,
    );

    const { container } = render(<MathText text={out} />);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
  });
});
