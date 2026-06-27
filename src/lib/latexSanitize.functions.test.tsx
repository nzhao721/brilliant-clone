import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MathText } from '../components/MathText';
/* Functions-side sanitizer, imported across the package boundary so the server's
 * safety net is unit-tested by the main suite. */
import { sanitizeAiLatex } from '../../functions/src/latexSanitize';

/* The sanitizer is a THIN KaTeX validator/fallback: it no longer reconstructs
 * mangled commands, just keeps each math span verbatim when KaTeX renders it, else
 * downgrades it to plain text (escaping `$`) instead of a red error box. */

/* OLD control-char corruption, kept to prove the validator DOWNGRADES such spans
 * instead of recovering them (C-style escapes → control char; else NUL + letter). */
const C_ESCAPE: Record<string, string> = {
  a: '\u0007', b: '\u0008', t: '\u0009', n: '\u000a', v: '\u000b', f: '\u000c', r: '\u000d',
};
function corrupt(s: string): string {
  return s.replace(/\\([a-zA-Z])/g, (_m, letter: string) =>
    C_ESCAPE[letter] !== undefined ? C_ESCAPE[letter] : '\u0000' + letter,
  );
}

describe('sanitizeAiLatex keeps clean, renderable LaTeX verbatim', () => {
  it('passes inline, display, and \\(...\\)/\\[...\\] math through untouched', () => {
    const clean = 'Compute $\\int_0^1 x^2 \\, dx$ and $\\frac{d}{dx} e^x$.';
    expect(sanitizeAiLatex(clean)).toBe(clean);
    expect(sanitizeAiLatex('Block $$\\frac{a}{b}$$ here.')).toBe('Block $$\\frac{a}{b}$$ here.');
    expect(sanitizeAiLatex('inline \\(c+d\\) and block \\[a^2+b^2\\]')).toBe(
      'inline \\(c+d\\) and block \\[a^2+b^2\\]',
    );
  });

  it('passes the previously-"unrecoverable" \\nabla / \\ne commands through cleanly', () => {
    const clean = 'Since $\\nabla f = 0$ and $a \\ne b$, check the gradient.';
    expect(sanitizeAiLatex(clean)).toBe(clean);
  });

  it('leaves plain prose and currency ($5 / \\$5) untouched', () => {
    expect(sanitizeAiLatex('The derivative is the rate of change.')).toBe(
      'The derivative is the rate of change.',
    );
    expect(sanitizeAiLatex('It costs \\$5 to retry.')).toBe('It costs \\$5 to retry.');
    expect(sanitizeAiLatex('You pay $5 today')).toBe('You pay $5 today');
  });

  it('is idempotent', () => {
    for (const c of ['Compute $\\frac{1}{2}$.', 'no math here', '$$\\sum_{k=1}^n k$$', 'Bad $\\frac$ x']) {
      const once = sanitizeAiLatex(c);
      expect(sanitizeAiLatex(once)).toBe(once);
    }
  });
});

describe('sanitizeAiLatex downgrades a genuinely-bad math span to plain text', () => {
  it('drops the delimiters of an undefined-command span', () => {
    expect(sanitizeAiLatex('See $\\notacommand$ now')).toBe('See \\notacommand now');
  });

  it('downgrades a malformed \\frac (missing args)', () => {
    expect(sanitizeAiLatex('Bad $\\frac$ span')).toBe('Bad \\frac span');
  });

  it('downgrades an unbalanced-brace span', () => {
    expect(sanitizeAiLatex('Oops $\\frac{1}{2$ end')).toBe('Oops \\frac{1}{2 end');
  });

  it('downgrades control-char-corrupted commands instead of recovering them', () => {
    /* corrupt('$\\frac{1}{x}$') -> '$<FF>rac{1}{x}$'; KaTeX rejects it, so the span
     * becomes plain text — NOT reconstructed back to \frac. */
    const out = sanitizeAiLatex(corrupt('$\\frac{1}{x}$'));
    expect(out).not.toContain('$'); // delimiters dropped
    expect(out).not.toContain('\\frac'); // not reconstructed
  });

  it('keeps a valid span but downgrades only the broken one in mixed text', () => {
    expect(sanitizeAiLatex('Good $\\frac{1}{2}$ bad $\\frac$ end')).toBe(
      'Good $\\frac{1}{2}$ bad \\frac end',
    );
  });
});

describe('sanitized output never produces a KaTeX error box in MathText', () => {
  it('renders clean structured LaTeX directly as real math', () => {
    const { container } = render(<MathText text={sanitizeAiLatex('$\\frac{1}{2}$')} />);
    expect(container.querySelector('.mfrac')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
  });

  it('renders a downgraded bad span as plain text with no error box', () => {
    const { container } = render(<MathText text={sanitizeAiLatex('Bad $\\frac$ span')} />);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('Bad \\frac span');
  });
});
