import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MathText, stackLimitOperators } from './MathText';

describe('MathText', () => {
  it('renders plain text without KaTeX markup', () => {
    const { container } = render(<MathText text="Plain lesson copy stays readable." />);

    expect(screen.getByText('Plain lesson copy stays readable.')).toBeInTheDocument();
    expect(container.querySelector('.katex')).not.toBeInTheDocument();
  });

  it('renders inline and block LaTeX delimiters through KaTeX', () => {
    const { container } = render(
      <MathText text="Inline $f(x)$ and block $$\\frac{f(a + h) - f(a)}{h}$$ math." />,
    );

    expect(container.querySelector('.katex')).toBeInTheDocument();
    expect(container.querySelector('.katex-display')).toBeInTheDocument();
    expect(container).toHaveTextContent('Inline');
    expect(container).toHaveTextContent('math.');
  });

  it('wraps inline math in a .math-inline span and block math in .math-block', () => {
    /* The collision-avoidance spacing is keyed off these wrapper classes, so renders must keep emitting them. */
    const { container } = render(
      <MathText text={'Inline $\\dfrac{0}{0}$ then block $$\\dfrac{0}{0}$$ done.'} />,
    );

    const inline = container.querySelector('.math-inline');
    expect(inline).toBeInTheDocument();
    expect(inline?.querySelector('.katex')).toBeInTheDocument();
    // Inline math must NOT be the display variant (that would be a tall block).
    expect(inline?.querySelector('.katex-display')).not.toBeInTheDocument();

    const block = container.querySelector('.math-block');
    expect(block).toBeInTheDocument();
    expect(block?.querySelector('.katex-display')).toBeInTheDocument();
  });

  it('renders fraction macros as a real fraction, not leaked source', () => {
    const { container } = render(<MathText text={'$g(x) = \\dfrac{1}{x - 3}$'} />);

    /* A working KaTeX build turns \dfrac into .mfrac; a broken one leaks the literal
       source in errorColor (the regression guarded here). */
    expect(container.querySelector('.mfrac')).toBeInTheDocument();
    expect(container.querySelector('.katex-html')?.textContent ?? '').not.toContain('\\dfrac');
  });

  it('renders clean \\alpha and \\vec commands as math, not KaTeX error boxes', () => {
    /* The AI pipeline delivers clean LaTeX, so real `\alpha`/`\vec` must render as
       KaTeX, never a `.katex-error` box. */
    const { container } = render(
      <MathText text={'Angle $\\alpha$ and vector $\\vec{v}$ matter.'} />,
    );

    expect(container.querySelectorAll('.katex')).toHaveLength(2);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('Angle');
    expect(container).toHaveTextContent('matter.');
  });

  it('renders the formal derivative definition without a KaTeX parse error', () => {
    const { container } = render(
      <MathText text="Read and interpret: [[formal-derivative-formula]]" />,
    );

    expect(container.querySelector('.formal-derivative-formula')).toBeInTheDocument();
    expect(container.querySelector('sup.formal-prime')).toBeInTheDocument();
    expect(container.querySelector('.formal-limit')).toBeInTheDocument();
    expect(container.querySelector('.formal-fraction')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('\\lim');
    expect(container).not.toHaveTextContent('\\frac');
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
  });
});

/*
 * Delimiter-scanner robustness against messy AI strings: a stray/escaped/unbalanced
 * dollar must not flip following segments. Counting `.math-inline`/`.math-block`
 * wrappers proves what became math vs prose.
 */
describe('MathText robust delimiter handling (AI replies)', () => {
  it('renders a single inline span and keeps the surrounding prose as prose', () => {
    const { container } = render(<MathText text={"the slope is $f'(x)=2x$ here"} />);

    // Exactly one math span; the prose on either side is NOT math.
    expect(container.querySelectorAll('.math-inline')).toHaveLength(1);
    expect(container.querySelectorAll('.math-block')).toHaveLength(0);
    expect(container.querySelector('.katex')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();

    expect(container).toHaveTextContent('the slope is');
    expect(container).toHaveTextContent('here');
    // The prose words were not swallowed into the KaTeX span.
    const inline = container.querySelector('.math-inline');
    expect(inline?.textContent ?? '').not.toContain('slope');
    expect(inline?.textContent ?? '').not.toContain('here');
  });

  it('leaves a lone/stray $ as literal text (no math, no flipping)', () => {
    const { container } = render(<MathText text="just a lone $ dollar sign" />);

    expect(container.querySelectorAll('.math-inline')).toHaveLength(0);
    expect(container.querySelectorAll('.math-block')).toHaveLength(0);
    expect(container.querySelector('.katex')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('just a lone $ dollar sign');
  });

  it('leaves an unbalanced opening $ as literal text instead of consuming the rest', () => {
    const { container } = render(<MathText text="$x = 2 and more text" />);

    expect(container.querySelectorAll('.math-inline')).toHaveLength(0);
    expect(container.querySelector('.katex')).not.toBeInTheDocument();
    // The whole string, including the stray leading $, stays as prose.
    expect(container).toHaveTextContent('$x = 2 and more text');
  });

  it('treats an escaped \\$ as a literal dollar, never a delimiter', () => {
    const { container } = render(<MathText text={'it costs \\$5 today'} />);

    expect(container.querySelectorAll('.math-inline')).toHaveLength(0);
    expect(container.querySelector('.katex')).not.toBeInTheDocument();
    // The backslash is consumed and a literal "$5" is shown.
    expect(container).toHaveTextContent('it costs $5 today');
    expect(container.textContent ?? '').not.toContain('\\$');
  });

  it('does not let an escaped \\$ flip the real math that follows it', () => {
    /* The production bug: an escaped currency dollar before a real inline span,
       which the old parser mis-paired. */
    const { container } = render(
      <MathText text={'it costs \\$5 but $f(x)=x^2$ grows'} />,
    );

    expect(container.querySelectorAll('.math-inline')).toHaveLength(1);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('it costs $5 but');
    expect(container).toHaveTextContent('grows');
    const inline = container.querySelector('.math-inline');
    expect(inline?.textContent ?? '').not.toContain('costs');
    expect(inline?.textContent ?? '').not.toContain('but');
  });

  it('supports \\( \\) inline and \\[ \\] block delimiters the model may emit', () => {
    const { container } = render(
      <MathText text={'block \\[a^2 + b^2\\] and inline \\(c + d\\) too'} />,
    );

    expect(container.querySelectorAll('.math-block')).toHaveLength(1);
    expect(container.querySelectorAll('.math-inline')).toHaveLength(1);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('block');
    expect(container).toHaveTextContent('and inline');
    expect(container).toHaveTextContent('too');
    // The raw delimiters must not leak into the rendered text.
    expect(container.textContent ?? '').not.toContain('\\[');
    expect(container.textContent ?? '').not.toContain('\\(');
  });

  it('renders two separate inline spans with the middle prose untouched', () => {
    const { container } = render(<MathText text="$a$ then text then $b$" />);

    expect(container.querySelectorAll('.math-inline')).toHaveLength(2);
    expect(container.querySelectorAll('.math-block')).toHaveLength(0);
    expect(container.querySelectorAll('.katex')).toHaveLength(2);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('then text then');

    const inlines = container.querySelectorAll('.math-inline');
    expect(inlines[0]?.textContent ?? '').not.toContain('then');
    expect(inlines[1]?.textContent ?? '').not.toContain('then');
  });

  it('keeps real math working even when a later $ is left unbalanced', () => {
    const { container } = render(<MathText text="first $x^2$ then $oops broken" />);

    // The balanced span renders; the trailing lone $ stays literal.
    expect(container.querySelectorAll('.math-inline')).toHaveLength(1);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('then $oops broken');
  });

  it('still renders block $$...$$ math', () => {
    const { container } = render(
      <MathText text={'Definition $$\\frac{a}{b}$$ shown.'} />,
    );

    expect(container.querySelectorAll('.math-block')).toHaveLength(1);
    expect(container.querySelector('.katex-display')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('Definition');
    expect(container).toHaveTextContent('shown.');
  });
});

/*
 * Limits stacking: inline KaTeX puts `\lim`'s script beside the operator, so the
 * preprocessor injects `\limits` to stack it. Assert the string transform and the
 * HTML (`.op-limits` = stacked); op-limits in inline math proves the transform ran.
 */
describe('MathText stacked limits transform', () => {
  it('injects \\limits after \\lim before a subscript', () => {
    expect(stackLimitOperators('\\lim_{x \\to a} f(x)')).toBe(
      '\\lim\\limits_{x \\to a} f(x)',
    );
  });

  it('injects \\limits before a block limit subscript', () => {
    expect(stackLimitOperators('\\lim_{n\\to\\infty}\\frac1n')).toBe(
      '\\lim\\limits_{n\\to\\infty}\\frac1n',
    );
  });

  it('matches the whole \\limsup token instead of mangling it into \\lim + sup', () => {
    expect(stackLimitOperators('\\limsup_{n} a_n')).toBe(
      '\\limsup\\limits_{n} a_n',
    );
    // The bug we guard against: producing "\lim\limits sup" / "\limsup" split.
    expect(stackLimitOperators('\\limsup_{n}')).not.toContain('\\lim\\limits sup');
  });

  it('covers the rest of the limit/operator family (incl. superscripts and whitespace)', () => {
    expect(stackLimitOperators('\\liminf_{n}')).toBe('\\liminf\\limits_{n}');
    expect(stackLimitOperators('\\varlimsup_{n}')).toBe('\\varlimsup\\limits_{n}');
    expect(stackLimitOperators('\\varliminf_{n}')).toBe('\\varliminf\\limits_{n}');
    expect(stackLimitOperators('\\sup_{x}')).toBe('\\sup\\limits_{x}');
    expect(stackLimitOperators('\\max^{2}')).toBe('\\max\\limits^{2}');
    expect(stackLimitOperators('\\argmax_{\\theta}')).toBe('\\argmax\\limits_{\\theta}');
    // Optional whitespace between the operator and the script is preserved.
    expect(stackLimitOperators('\\lim _{x}')).toBe('\\lim\\limits _{x}');
  });

  it('never double-injects when \\limits or \\nolimits is already present', () => {
    expect(stackLimitOperators('\\lim\\limits_{x}')).toBe('\\lim\\limits_{x}');
    expect(stackLimitOperators('\\lim\\nolimits_{x}')).toBe('\\lim\\nolimits_{x}');
  });

  it('leaves non-operator subscripts and unrelated commands untouched', () => {
    expect(stackLimitOperators('x_i')).toBe('x_i');
    expect(stackLimitOperators('a_n + b^2')).toBe('a_n + b^2');
    expect(stackLimitOperators('\\frac{a}{b}')).toBe('\\frac{a}{b}');
    expect(stackLimitOperators('\\lim f(x)')).toBe('\\lim f(x)');
  });

  it('renders inline $\\lim_{x \\to a} f(x)$ with the script stacked under the operator', () => {
    const { container } = render(<MathText text={'$\\lim_{x \\to a} f(x)$'} />);

    const inline = container.querySelector('.math-inline');
    expect(inline).toBeInTheDocument();
    // Inline (not display) math that nonetheless stacks => the transform ran.
    expect(inline?.querySelector('.katex-display')).not.toBeInTheDocument();
    expect(inline?.querySelector('.op-limits')).toBeInTheDocument();
    // Stacked form does not use a beside-the-operator subscript box.
    expect(inline?.querySelector('.msupsub')).not.toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
  });

  it('renders block $$\\lim_{n\\to\\infty}\\frac1n$$ with stacked limits', () => {
    const { container } = render(
      <MathText text={'$$\\lim_{n\\to\\infty}\\frac1n$$'} />,
    );

    const block = container.querySelector('.math-block');
    expect(block).toBeInTheDocument();
    expect(block?.querySelector('.katex-display')).toBeInTheDocument();
    expect(block?.querySelector('.op-limits')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
  });

  it('keeps \\limsup_{n} rendering correctly (stacked, no error)', () => {
    const { container } = render(<MathText text={'$\\limsup_{n} a_n$'} />);

    const inline = container.querySelector('.math-inline');
    expect(inline?.querySelector('.op-limits')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
  });

  it('does NOT stack a non-limit subscript like $x_i$ (stays beside)', () => {
    const { container } = render(<MathText text={'$x_i$'} />);

    const inline = container.querySelector('.math-inline');
    expect(inline?.querySelector('.op-limits')).not.toBeInTheDocument();
    // Ordinary subscripts still use the beside-the-base script box.
    expect(inline?.querySelector('.msupsub')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
  });
});
