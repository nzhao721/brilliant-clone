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
  it('wraps a fully bare prompt formula in $...$ and restores the dropped \\lim', () => {
    // Exactly the screenshot string: bare, and the model even dropped the `\` on
    // `lim`. The whole contiguous run is wrapped AND the backslash-stripped `lim`
    // command is restored so KaTeX renders the real limit operator (not italic
    // l·i·m). `\to`/`\infty`/`\frac` already had their backslash.
    expect(normalizeAiMath('lim_{n\\to\\infty}\\frac{5}{n}')).toBe(
      '$\\lim_{n\\to\\infty}\\frac{5}{n}$',
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

// Regression for the \dfrac/\int "spaced math" bug: AI math frequently contains
// INTERNAL SPACES (`\lim_{x \to 4} f(x)`, `\int_0^1 x^2 \, dx`). The old word-
// based normalizer split such a formula at every space and wrapped broken,
// unbalanced-brace fragments, which KaTeX rendered as red source / no-glyph
// (tofu) boxes. The rewritten left-to-right scanner wraps the WHOLE contiguous
// LaTeX run — across spaces and balanced braces — so it renders as real math.
describe('normalizeAiMath spaced-LaTeX runs (\\dfrac/\\int regression)', () => {
  /** Visible text with KaTeX math removed — reveals any leaked raw source / `$`. */
  function visibleProse(container: HTMLElement): string {
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.katex').forEach((el) => el.remove());
    return clone.textContent ?? '';
  }

  /** True when the rendered output contains a tofu / no-glyph / control char. */
  function hasTofu(container: HTMLElement): boolean {
    const text = container.textContent ?? '';
    // eslint-disable-next-line no-control-regex
    return /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
  }

  it('wraps the BARE \\lim/\\dfrac formula (space inside braces) as real math', () => {
    const input = 'lim_{x\\to 4}\\dfrac{x^2-16}{x-4}.';
    // The dropped backslash on `lim` is restored to `\lim` inside the wrapped run.
    expect(normalizeAiMath(input)).toBe('$\\lim_{x\\to 4}\\dfrac{x^2-16}{x-4}$.');

    const { container } = render(<MathText text={normalizeAiMath(input)} />);
    expect(container.querySelector('.mfrac')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(hasTofu(container)).toBe(false);
    expect(container.querySelector('.katex-html')?.textContent ?? '').not.toContain('\\dfrac');
    // The trailing period stays prose, outside the math.
    expect(visibleProse(container)).toContain('.');
  });

  it('leaves the already-DELIMITED \\lim/\\dfrac prompt untouched and rendering math', () => {
    const input = 'Evaluate $\\lim_{x\\to 4}\\dfrac{x^2-16}{x-4}$.';
    expect(normalizeAiMath(input)).toBe(input);

    const { container } = render(<MathText text={normalizeAiMath(input)} />);
    expect(container.querySelectorAll('.math-inline')).toHaveLength(1);
    expect(container.querySelector('.mfrac')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(hasTofu(container)).toBe(false);
    expect(container).toHaveTextContent('Evaluate');
  });

  it('wraps an integral with spaced tokens `\\int_0^1 x^2 \\, dx` as ONE run', () => {
    const input = '\\int_0^1 x^2 \\, dx';
    // The whole run — including the spaces and the `\, dx` differential — is wrapped.
    expect(normalizeAiMath(input)).toBe('$\\int_0^1 x^2 \\, dx$');

    const { container } = render(<MathText text={normalizeAiMath(input)} />);
    expect(container.querySelectorAll('.math-inline')).toHaveLength(1);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(hasTofu(container)).toBe(false);
    // No raw command leaks into the visible (non-MathML) layer.
    const visibleHtml = container.querySelector('.katex-html')?.textContent ?? '';
    expect(visibleHtml).not.toContain('\\int');
    expect(visibleHtml).not.toContain('\\,');
    expect(visibleProse(container).trim()).toBe('');
  });

  it('wraps `\\lim_{x \\to 4} f(x)` (space before f(x), space inside braces) as ONE run', () => {
    const input = '\\lim_{x \\to 4} f(x)';
    expect(normalizeAiMath(input)).toBe('$\\lim_{x \\to 4} f(x)$');

    const { container } = render(<MathText text={normalizeAiMath(input)} />);
    expect(container.querySelectorAll('.math-inline')).toHaveLength(1);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(hasTofu(container)).toBe(false);
    expect(visibleProse(container).trim()).toBe('');
  });

  it('keeps the formula and surrounding prose distinct in a real prompt', () => {
    const input = 'Evaluate lim_{x\\to 4}\\dfrac{x^2-16}{x-4}.';
    // Prose "Evaluate" stays prose; inside the run the dropped `lim` -> `\lim`.
    expect(normalizeAiMath(input)).toBe('Evaluate $\\lim_{x\\to 4}\\dfrac{x^2-16}{x-4}$.');

    const { container } = render(<MathText text={normalizeAiMath(input)} />);
    expect(container.querySelectorAll('.math-inline')).toHaveLength(1);
    expect(container.querySelector('.mfrac')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('Evaluate');
    const inline = container.querySelector('.math-inline');
    expect(inline?.textContent ?? '').not.toContain('Evaluate');
  });

  it('never emits an unbalanced-brace fragment for spaced math (no katex-error)', () => {
    // Each of these used to fragment at a space into broken pieces. Now: at most
    // one run, balanced braces, and never a KaTeX error box.
    for (const input of [
      '\\int_0^1 x^2 \\, dx',
      '\\lim_{x \\to 4} f(x)',
      'lim_{x\\to 4}\\dfrac{x^2-16}{x-4}.',
      '\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}',
    ]) {
      const out = normalizeAiMath(input);
      // Balanced dollars and braces in the transformed string.
      expect((out.match(/\$/g) || []).length % 2).toBe(0);
      let depth = 0;
      for (const ch of out) {
        if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
        expect(depth).toBeGreaterThanOrEqual(0);
      }
      expect(depth).toBe(0);

      const { container } = render(<MathText text={out} />);
      expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
      expect(hasTofu(container)).toBe(false);
    }
  });

  it('strips stray control characters so KaTeX never renders a tofu / no-glyph box', () => {
    // Defense for the "no glyph box" symptom: if a control char ever survives the
    // upstream escape repair, normalizeAiMath removes it so KaTeX gets clean math.
    const input = 'Evaluate \u0001\u0000lim_{x\\to 4}\\dfrac{x^2-16}{x-4}.';
    const out = normalizeAiMath(input);

    // No control characters remain in the output.
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
    expect(out).toBe('Evaluate $\\lim_{x\\to 4}\\dfrac{x^2-16}{x-4}$.');

    const { container } = render(<MathText text={out} />);
    expect(container.querySelector('.mfrac')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(hasTofu(container)).toBe(false);
  });

  it('is idempotent on the spaced-math cases', () => {
    for (const input of [
      'lim_{x\\to 4}\\dfrac{x^2-16}{x-4}.',
      'Evaluate $\\lim_{x\\to 4}\\dfrac{x^2-16}{x-4}$.',
      '\\int_0^1 x^2 \\, dx',
      '\\lim_{x \\to 4} f(x)',
    ]) {
      const once = normalizeAiMath(input);
      expect(normalizeAiMath(once)).toBe(once);
    }
  });
});
