import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MathText } from './MathText';

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
    // The collision-avoidance spacing (vertical margin / line-box growth) is
    // keyed off these wrapper classes, so renders must keep emitting them:
    // inline display fractions get the breathing room, block math its own box.
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

    // A working KaTeX build turns \dfrac into an .mfrac element. If the renderer
    // cannot resolve the macro it leaks the literal "\dfrac" source in errorColor
    // instead, which is the regression this guards against.
    expect(container.querySelector('.mfrac')).toBeInTheDocument();
    expect(container.querySelector('.katex-html')?.textContent ?? '').not.toContain('\\dfrac');
  });

  it('renders repaired \\alpha and \\vec commands as math, not KaTeX error boxes', () => {
    // Regression for the AI-coach render bug: OpenAI's structured output mangles
    // the backslash of \alpha (-> BEL) and \vec (-> vertical tab) into control
    // chars; once repairLatexEscapes (src/lib/ai.ts) restores them to real
    // backslashes, MathText must render genuine KaTeX. Before BEL/VT were added
    // to the repair map these surfaced as red `.katex-error` boxes.
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

// Robustness of the delimiter scanner against the realistic, sometimes-messy
// strings the AI coach emits. The bug these guard against: the old alternating
// parser paired the FIRST `$` with the NEXT `$`, so one stray/escaped/unbalanced
// dollar flipped every following segment between prose and math ("some math as
// text AND some text as math"). Math segments are wrapped in `.math-inline` /
// `.math-block`, so counting those wrappers proves what became math vs prose.
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
    // The exact shape of the production bug: an escaped currency dollar BEFORE a
    // real inline span. The old parser paired the `\$` dollar with the next `$`,
    // rendering "5 but " as math and "f(x)=x^2" as plain text.
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
