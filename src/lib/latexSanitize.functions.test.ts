import { describe, expect, it } from 'vitest';
// Functions-side sanitizer (Cloud Functions). Imported across the package
// boundary so the server's repair logic is unit-tested by the main suite.
import {
  repairLatexEscapes,
  sanitizeAiLatex,
  stripNonRenderable,
} from '../../functions/src/latexSanitize';

// Simulate the OpenAI structured-output corruption: C-style escapes consume
// their letter into a control char; any other `\<letter>` collapses to NUL +
// letters.
const C_ESCAPE: Record<string, string> = {
  a: '\u0007', b: '\u0008', t: '\u0009', n: '\u000a', v: '\u000b', f: '\u000c', r: '\u000d',
};
function corrupt(s: string): string {
  return s.replace(/\\([a-zA-Z])/g, (_m, letter: string) =>
    C_ESCAPE[letter] !== undefined ? C_ESCAPE[letter] : '\u0000' + letter,
  );
}

describe('functions repairLatexEscapes (full command set)', () => {
  it('restores every C-escape command family from its control char', () => {
    // \a BEL, \b BS, \t TAB, \v VT, \f FF, \r CR.
    expect(repairLatexEscapes(corrupt('\\alpha'))).toBe('\\alpha');
    expect(repairLatexEscapes(corrupt('\\beta'))).toBe('\\beta');
    expect(repairLatexEscapes(corrupt('\\theta'))).toBe('\\theta');
    expect(repairLatexEscapes(corrupt('\\text{x}'))).toBe('\\text{x}');
    expect(repairLatexEscapes(corrupt('\\vec{v}'))).toBe('\\vec{v}');
    expect(repairLatexEscapes(corrupt('\\varepsilon'))).toBe('\\varepsilon');
    expect(repairLatexEscapes(corrupt('\\frac{1}{2}'))).toBe('\\frac{1}{2}');
    expect(repairLatexEscapes(corrupt('\\rho'))).toBe('\\rho');
  });

  it('restores invalid-escape commands (NUL + letters): \\delta, \\epsilon, \\lim, ...', () => {
    expect(repairLatexEscapes(corrupt('\\delta'))).toBe('\\delta');
    expect(repairLatexEscapes(corrupt('\\epsilon'))).toBe('\\epsilon');
    expect(repairLatexEscapes(corrupt('\\sigma'))).toBe('\\sigma');
    expect(repairLatexEscapes(corrupt('\\lim'))).toBe('\\lim');
    expect(repairLatexEscapes(corrupt('\\cos'))).toBe('\\cos');
    expect(repairLatexEscapes(corrupt('\\int'))).toBe('\\int');
    expect(repairLatexEscapes(corrupt('\\infty'))).toBe('\\infty');
  });

  it('recovers the \\n-command family from LF (the previously-skipped case)', () => {
    expect(repairLatexEscapes(corrupt('\\nabla f'))).toBe('\\nabla f');
    expect(repairLatexEscapes(corrupt('x \\neq y'))).toBe('x \\neq y');
    expect(repairLatexEscapes(corrupt('a \\notin B'))).toBe('a \\notin B');
    expect(repairLatexEscapes(corrupt('a \\nmid b'))).toBe('a \\nmid b');
  });

  it('does NOT turn a genuine newline into a broken \\n command', () => {
    // A real line break (LF followed by ordinary prose, not an \n-command body)
    // must stay a newline, never become `\nThe...`.
    const realNewline = 'First line.\nThe second line.';
    expect(repairLatexEscapes(realNewline)).toBe(realNewline);
    expect(repairLatexEscapes('done.\nevery time')).toBe('done.\nevery time');
  });

  it('restores the full δ-ε definition sentence', () => {
    const intended = 'the $\\delta$-$\\varepsilon$ definition for the output tolerance $\\varepsilon$?';
    expect(repairLatexEscapes(corrupt(intended))).toBe(intended);
  });

  it('leaves clean (correctly escaped) LaTeX untouched', () => {
    const clean = 'Compute $\\int_0^1 x^2 \\, dx$ and $\\frac{d}{dx} e^x$.';
    expect(repairLatexEscapes(clean)).toBe(clean);
    expect(sanitizeAiLatex(clean)).toBe(clean);
  });
});

describe('functions stripNonRenderable', () => {
  it('removes U+FFFD, non-characters, and residual C0/C1 controls', () => {
    expect(stripNonRenderable('a\uFFFDb')).toBe('ab');
    expect(stripNonRenderable('x\u0001\u0002y')).toBe('xy');
    expect(stripNonRenderable('p\u009Fq')).toBe('pq');
    expect(stripNonRenderable('m\uFFFE\uFFFFn')).toBe('mn');
  });

  it('keeps ordinary whitespace and normal text (including valid astral chars)', () => {
    expect(stripNonRenderable('a\tb\nc\rd')).toBe('a\tb\nc\rd');
    expect(stripNonRenderable('hello world')).toBe('hello world');
    expect(stripNonRenderable('emoji \u{1F600} ok')).toBe('emoji \u{1F600} ok');
  });
});

describe('functions sanitizeAiLatex (repair + strip)', () => {
  it('repairs control-char corruption AND strips any residual replacement char', () => {
    // A control-char corrupted command next to a dropped (U+FFFD) one.
    const corrupted = corrupt('the $\\delta$ near') + ' $\uFFFD$ end';
    const out = sanitizeAiLatex(corrupted);
    expect(out).toContain('$\\delta$');
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFD]/);
  });
});
