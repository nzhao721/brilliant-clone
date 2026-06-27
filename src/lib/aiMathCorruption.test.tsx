import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MathText } from '../components/MathText';

// End-to-end regression for the δ/ε "NO GLYPH" (tofu) bug. We feed the REALISTIC
// OpenAI structured-output corruption straight into the real client AI path
// (coerce -> cleanAiMathText -> repairLatexEscapes + normalizeAiMath/strip) and
// render the result through MathText (real KaTeX), asserting the math comes back
// as real glyphs with NO tofu and NO katex-error.

// Simulate the corruption: C-style escapes consume their letter into a control
// char; other `\<letter>` collapses to NUL + letters. (See latexSanitize.ts.)
const C_ESCAPE: Record<string, string> = {
  a: '\u0007', b: '\u0008', t: '\u0009', n: '\u000a', v: '\u000b', f: '\u000c', r: '\u000d',
};
function corrupt(s: string): string {
  return s.replace(/\\([a-zA-Z])/g, (_m, letter: string) =>
    C_ESCAPE[letter] !== undefined ? C_ESCAPE[letter] : '\u0000' + letter,
  );
}

// --- mocked callable so the real ai.ts runs with the tutor "enabled" ---------
type CallableResult = { data: unknown };
let callableImpl: () => Promise<CallableResult>;
const callable = vi.fn(() => callableImpl());
const httpsCallable = vi.fn(() => callable);
const getFunctions = vi.fn(() => ({ app: {}, region: 'us-central1' }));

async function importEnabledAi() {
  vi.resetModules();
  vi.stubEnv('VITE_ENABLE_AI_TUTOR', 'true');
  vi.stubEnv('VITE_FIREBASE_ENABLE_TEST_SERVICES', 'true');
  vi.doMock('./firebase', () => ({ firebaseApp: { name: '[DEFAULT]' } }));
  vi.doMock('firebase/functions', () => ({ getFunctions, httpsCallable }));
  return import('./ai');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('./firebase');
  vi.doUnmock('firebase/functions');
  vi.resetModules();
  vi.clearAllMocks();
});

/** Coerce a raw (corrupted) tutor message through the real client pipeline. */
async function coerceMessage(message: string): Promise<string> {
  callableImpl = () => Promise.resolve({ data: { message } });
  const ai = await importEnabledAi();
  const result = await ai.generateTutorResponse({
    mode: 'feedback-incorrect',
    prompt: 'p',
    chosenLabel: 'a',
    correctLabel: 'b',
    isCorrect: false,
    staticExplanation: '',
    profileSummary: '',
  });
  return result?.message ?? '';
}

/** Non-renderable code points in the rendered output (the tofu detector). */
function tofuCodePoints(container: HTMLElement): number[] {
  const out: number[] = [];
  for (const ch of container.textContent ?? '') {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d) continue;
    if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f) || (cp >= 0xd800 && cp <= 0xdfff) || cp === 0xfffd) {
      out.push(cp);
    }
  }
  return out;
}

const DELTA_EPSILON =
  'the $\\delta$-$\\varepsilon$ definition matches the output tolerance $\\varepsilon$?';

describe('AI math corruption -> render (δ/ε tofu regression)', () => {
  it('recovers δ and ε from control-char corruption and renders real glyphs', async () => {
    const coerced = await coerceMessage(corrupt(DELTA_EPSILON));

    // The control chars were repaired back to clean commands (no residual).
    expect(coerced).toBe(DELTA_EPSILON);
    // eslint-disable-next-line no-control-regex
    expect(coerced).not.toMatch(/[\u0000-\u001f\u007f-\u009f\ufffd]/);

    const { container } = render(<MathText text={coerced} />);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(tofuCodePoints(container)).toEqual([]);
    // KaTeX rendered the real Greek glyphs δ (U+03B4) and ε (U+03B5).
    expect(container.textContent ?? '').toContain('\u03B4');
    expect(container.textContent ?? '').toContain('\u03B5');
  });

  it('renders a \\delta\\text{-}\\varepsilon span (the \\text{-} fragment) with no tofu/raw source', async () => {
    const intended = 'the $\\delta\\text{-}\\varepsilon$ definition, tolerance $\\varepsilon$.';
    const coerced = await coerceMessage(corrupt(intended));
    expect(coerced).toBe(intended);

    const { container } = render(<MathText text={coerced} />);
    expect(container.querySelector('.katex')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(tofuCodePoints(container)).toEqual([]);
    // The repaired `\text{-}` renders (no raw command in the VISIBLE html layer).
    expect(container.querySelector('.katex-html')?.textContent ?? '').not.toContain('\\text');
    expect(container.textContent ?? '').toContain('\u03B4');
  });

  it('recovers \\nabla from the LF corruption (no lost command, no tofu)', async () => {
    const coerced = await coerceMessage(corrupt('the gradient $\\nabla f$ vanishes'));
    expect(coerced).toBe('the gradient $\\nabla f$ vanishes');

    const { container } = render(<MathText text={coerced} />);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(tofuCodePoints(container)).toEqual([]);
  });

  it('STRIPS unrecoverable U+FFFD so KaTeX never draws a no-glyph box', async () => {
    // A dropped command collapses to U+FFFD; it cannot be recovered, but it must
    // never reach KaTeX as a tofu box, and must not cause a katex-error.
    const coerced = await coerceMessage('the $\uFFFD$-$\uFFFD$ definition tolerance $\uFFFD$?');

    // eslint-disable-next-line no-control-regex
    expect(coerced).not.toMatch(/[\u0000-\u001f\u007f-\u009f\ufffd]/);

    const { container } = render(<MathText text={coerced} />);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(tofuCodePoints(container)).toEqual([]);
  });

  it('strips stray C0/C1 control chars mixed into a message (no tofu, no error)', async () => {
    // U+0001 and U+009F are NOT recoverable command escapes, so they are simply
    // stripped (never reach KaTeX). (BEL/BS/TAB/… would instead be repaired into
    // their `\<cmd>` form, which is the recoverable path covered above.)
    const coerced = await coerceMessage(
      'tolerance \u0001$\\varepsilon$\u009F and $x \\ge 0$',
    );
    // eslint-disable-next-line no-control-regex
    expect(coerced).not.toMatch(/[\u0000-\u001f\u007f-\u009f\ufffd]/);

    const { container } = render(<MathText text={coerced} />);
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(tofuCodePoints(container)).toEqual([]);
    expect(container.textContent ?? '').toContain('\u03B5');
  });
});
