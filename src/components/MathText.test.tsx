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
