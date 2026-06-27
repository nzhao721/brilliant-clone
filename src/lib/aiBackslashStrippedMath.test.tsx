import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MathText } from '../components/MathText';
import { sanitizeAiLatex } from '../../functions/src/latexSanitize';

// ===========================================================================
// End-to-end regression for the BACKSLASH-STRIPPED ("frace7"/bare-word) bug.
//
// MECHANISM (empirically confirmed): under strict structured-output JSON, the
// transport sometimes drops a LaTeX command's backslash ENTIRELY (distinct from
// the older control-char corruption) — so `\delta` arrives as the bare word
// "delta", `\frac{...}` as "frac{...}", `\varepsilon` as "varepsilon". There is
// NO control char to map back. KaTeX then renders the bare letters as ordinary
// italic text (e.g. "frac{ε}{7}" -> "fracε7" = the screenshot's "frace7"), with
// NO .katex-error and NO tofu, so the older detectors miss it. The model also
// sometimes emits a literal Unicode Greek glyph (δ/ε/ϵ), which KaTeX renders
// fine — which is exactly why SOME Greek looked correct in the same question
// while the backslash-dropped commands broke.
//
// These tests push the EXACT corrupted forms of the reported question (prompt +
// all four choices) through the REAL production pipeline:
//   functions sanitizeAiLatex (server)  ->  client ai.ts cleanAiMathText
//   (generateChallengeQuestions)  ->  MathText / real KaTeX
// and assert: real δ / ε glyphs render, `\frac{\varepsilon}{7}` renders as a
// real fraction (.mfrac), and there are NO bare "delta"/"epsilon"/"frac"/
// "frace7" literals and no .katex-error / tofu.
// ===========================================================================

// --- corruption simulators -------------------------------------------------

/** (B) the NEW bug: strict-JSON drops the backslash ENTIRELY -> bare word. */
function dropBackslash(s: string): string {
  return s.replace(/\\([a-zA-Z]+)/g, '$1');
}

/** The model emits a literal Unicode Greek glyph instead of a `\command`. */
function toUnicodeGreek(s: string): string {
  return s
    .replace(/\\varepsilon/g, '\u03B5') // ε U+03B5
    .replace(/\\epsilon/g, '\u03F5') // ϵ U+03F5
    .replace(/\\delta/g, '\u03B4'); // δ U+03B4
}

/** The screenshot's mix: Greek arrives as a Unicode glyph AND the remaining
 *  structural commands (`\frac`, …) lose their backslash -> "frac{ε}{7}". */
function screenshotMix(s: string): string {
  return dropBackslash(toUnicodeGreek(s));
}

// --- mocked callable so the REAL ai.ts runs with the tutor "enabled" -------
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

// --- the EXACT reported question (the task's reconstruction) ----------------
const PROMPT =
  'For $f(x)=7x-1$ near $x=2$, we have $L=13$. Which choice of $\\delta$ guarantees ' +
  'that if $0<|x-2|<\\delta$, then $|f(x)-L|<\\varepsilon$?';
const CHOICES = [
  { id: 'a', label: '$\\delta=\\varepsilon$' },
  { id: 'b', label: '$\\delta=\\frac{\\varepsilon}{7}$' },
  { id: 'c', label: '$\\delta=7\\varepsilon$' },
  { id: 'd', label: '$\\delta=\\varepsilon^2$' },
];
const CORRECT_ID = 'b';

type CoercedQuestion = {
  prompt: string;
  choices: { id: string; label: string }[];
  explanation: string;
};

/** Runs the corrupted question through the REAL client challenge pipeline. */
async function runChallenge(transform: (s: string) => string): Promise<CoercedQuestion | null> {
  callableImpl = () =>
    Promise.resolve({
      data: {
        questions: [
          {
            id: 'c1',
            prompt: transform(PROMPT),
            choices: CHOICES.map((c) => ({ id: c.id, label: transform(c.label) })),
            correctChoiceId: CORRECT_ID,
            explanation: transform('Scale the output tolerance $\\varepsilon$ by the slope.'),
            targetConcept: 'epsilon-delta definition',
          },
        ],
      },
    });

  const ai = await importEnabledAi();
  const result = await ai.generateChallengeQuestions({
    sessionQuestions: [
      {
        prompt: 'q',
        choices: [
          { id: 'a', label: 'a' },
          { id: 'b', label: 'b' },
        ],
        correctChoiceId: 'a',
        userChoiceId: 'b',
        isCorrect: false,
      },
    ],
    profileSummary: '',
    count: 1,
  });
  return (result?.questions[0] as CoercedQuestion | undefined) ?? null;
}

// --- render-layer helpers --------------------------------------------------

/** Visible text = prose + on-screen KaTeX glyphs, with the hidden MathML
 *  <annotation> (which legitimately holds the `\delta` TeX SOURCE) removed, so a
 *  surviving bare "delta"/"frac" here is a genuine un-rendered literal. */
function visibleText(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.katex-mathml').forEach((el) => el.remove());
  return clone.textContent ?? '';
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

const DELTA = '\u03B4';
const EPSILON = '\u03B5';

/** Asserts a rendered field has real glyphs and NO bare-word/tofu/error leak. */
function expectClean(text: string, opts: { delta?: boolean; epsilon?: boolean; mfrac?: boolean }) {
  const { container } = render(<MathText text={text} />);

  expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
  expect(tofuCodePoints(container)).toEqual([]);

  const visible = visibleText(container);
  // The on-screen layer must contain ZERO bare command literals.
  expect(visible).not.toContain('frace7');
  expect(visible).not.toContain('frac');
  expect(visible).not.toContain('delta');
  expect(visible).not.toContain('epsilon');
  expect(visible).not.toContain('varepsilon');

  if (opts.delta) expect(visible).toContain(DELTA);
  if (opts.epsilon) expect(visible).toContain(EPSILON);
  if (opts.mfrac) expect(container.querySelector('.mfrac')).toBeInTheDocument();
}

// Each corruption mode is exercised through BOTH (1) the client safety net alone
// (callable returns raw corrupted text — simulating a server that missed it) and
// (2) the full production chain (server sanitizeAiLatex first, then the client).
const MODES: { name: string; corrupt: (s: string) => string }[] = [
  { name: 'bare-word (backslash dropped)', corrupt: dropBackslash },
  { name: 'literal Unicode Greek', corrupt: toUnicodeGreek },
  { name: 'screenshot mix (frace7)', corrupt: screenshotMix },
];

describe('AI backslash-stripped math -> render (frace7 / bare-word regression)', () => {
  for (const mode of MODES) {
    for (const chain of ['client safety net', 'server+client chain'] as const) {
      const transform =
        chain === 'server+client chain'
          ? (s: string) => sanitizeAiLatex(mode.corrupt(s))
          : mode.corrupt;

      it(`[${mode.name} | ${chain}] restores prompt + all 4 choices to canonical math`, async () => {
        const q = await runChallenge(transform);
        expect(q).not.toBeNull();
        if (!q) return;

        // The pipeline converges every corruption mode to the SAME canonical,
        // backslash-correct LaTeX — exactly the intended source.
        expect(q.prompt).toBe(PROMPT);
        expect(q.choices.map((c) => c.label)).toEqual(CHOICES.map((c) => c.label));

        // Prompt renders δ and ε as real glyphs, no bare words, no error/tofu.
        expectClean(q.prompt, { delta: true, epsilon: true });

        // Choice (a) δ=ε
        expectClean(q.choices[0].label, { delta: true, epsilon: true });
        // Choice (b) δ=ε/7 — must be a REAL fraction (.mfrac), not "frace7".
        expectClean(q.choices[1].label, { delta: true, epsilon: true, mfrac: true });
        // Choice (c) δ=7ε
        expectClean(q.choices[2].label, { delta: true, epsilon: true });
        // Choice (d) δ=ε²
        expectClean(q.choices[3].label, { delta: true, epsilon: true });
      });
    }
  }

  it('directly documents the "frace7" choice: bare frac + Unicode ε -> real fraction', async () => {
    // Choice (b) exactly as the screenshot delivered it: "frac" lost its
    // backslash and the epsilon arrived as a literal Unicode glyph.
    const q = await runChallenge(screenshotMix);
    const choiceB = q?.choices[1].label ?? '';

    // The raw corrupted form really is the "fracε7" shape before the fix...
    expect(screenshotMix('$\\delta=\\frac{\\varepsilon}{7}$')).toBe('$\u03B4=frac{\u03B5}{7}$');
    // ...and the pipeline restores it to a proper fraction command.
    expect(choiceB).toBe('$\\delta=\\frac{\\varepsilon}{7}$');

    const { container } = render(<MathText text={choiceB} />);
    expect(container.querySelector('.mfrac')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();
    expect(visibleText(container)).not.toContain('frac');
  });
});
