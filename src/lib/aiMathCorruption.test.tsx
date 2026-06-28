import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MathText } from '../components/MathText';

/*
 * CLIENT-side proof that the safety-net (normalizeAiMath) runs on EVERY math-bearing
 * field of EVERY callable when its reply is consumed. We enable the AI tutor, mock
 * `firebase/functions` so the callable returns a CORRUPTED payload (C0 control chars,
 * U+FFFD, and backslash-stripped commands), then assert no non-renderable "tofu"
 * character survives in anything the client hands back — and that the cleaned text
 * renders through MathText with no tofu char in the DOM. Mirrors the server proof in
 * functions/src/aiSanitizePipeline.test.ts so both ends strip the SAME set.
 */

/* No-glyph chars that paint a "tofu" box; non-global so `.test` has no lastIndex. */
const HAS_NON_RENDERABLE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\ufffd]/;

const C_ESCAPE: Record<string, string> = {
  a: '\u0007', b: '\u0008', t: '\u0009', n: '\u000a', v: '\u000b', f: '\u000c', r: '\u000d',
};
function corrupt(s: string): string {
  return s.replace(/\\([a-zA-Z])/g, (_m, letter: string) =>
    C_ESCAPE[letter] !== undefined ? C_ESCAPE[letter] : '\u0000' + letter,
  );
}
/* A field carrying every corruption type at once; non-empty after cleaning. */
function corruptedField(prefix: string): string {
  return `${prefix} 1/x\u0007 ${corrupt('$\\frac{1}{x}$')} tail\ufffd`;
}

// Controllable mock for the callable (mirrors src/lib/ai.test.ts).
type CallableResult = { data: unknown };
let callableImpl: () => Promise<CallableResult>;
const callable = vi.fn((_input?: unknown) => callableImpl());
const httpsCallable = vi.fn(() => callable);
const getFunctions = vi.fn(() => ({ app: {}, region: 'us-central1', customDomain: null }));

/** Re-import `./ai` with the tutor ENABLED and `firebase/functions` mocked. */
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

beforeEach(() => {
  callableImpl = () => Promise.resolve({ data: { message: 'ok' } });
});

describe('generateTutorResponse cleans corrupted message + misconception', () => {
  it('returns no non-renderable char in any field', async () => {
    callableImpl = () =>
      Promise.resolve({
        data: { message: corruptedField('Close —'), misconception: 'lost\ufffda power\u0001' },
      });
    const ai = await importEnabledAi();

    const result = await ai.generateTutorResponse({
      mode: 'feedback-incorrect',
      prompt: 'derivative of $x^2$?',
      chosenLabel: '$x$',
      correctLabel: '$2x$',
      isCorrect: false,
      staticExplanation: '',
      profileSummary: '',
    });

    expect(result).not.toBeNull();
    expect(HAS_NON_RENDERABLE.test(result!.message)).toBe(false);
    expect(HAS_NON_RENDERABLE.test(result!.misconception ?? '')).toBe(false);
    expect(result!.message.length).toBeGreaterThan(0);

    // The cleaned message renders with no tofu char in the DOM.
    const { container } = render(<MathText text={result!.message} />);
    expect(HAS_NON_RENDERABLE.test(container.textContent ?? '')).toBe(false);
  });
});

describe('prefetchTutorResponses cleans hint + every per-choice field', () => {
  it('returns no non-renderable char in any field', async () => {
    callableImpl = () =>
      Promise.resolve({
        data: {
          hint: corruptedField('Think:'),
          perChoice: [
            { choiceId: 'a', message: corruptedField('Yes!'), misconception: null },
            { choiceId: 'b', message: corruptedField('Nope'), misconception: 'dropped\ufffdit' },
          ],
        },
      });
    const ai = await importEnabledAi();

    const result = await ai.prefetchTutorResponses({
      prompt: 'derivative of $x^2$?',
      choices: [
        { id: 'a', label: '$2x$' },
        { id: 'b', label: '$x$' },
      ],
      correctChoiceId: 'a',
      profileSummary: '',
    });

    expect(result).not.toBeNull();
    expect(HAS_NON_RENDERABLE.test(result!.hint)).toBe(false);
    expect(result!.perChoice).toHaveLength(2);
    for (const choice of result!.perChoice) {
      expect(HAS_NON_RENDERABLE.test(choice.message)).toBe(false);
      expect(HAS_NON_RENDERABLE.test(choice.misconception ?? '')).toBe(false);
    }
  });
});

describe('generateChallengeQuestions cleans prompt, choices[].label, explanation, targetConcept', () => {
  it('returns no non-renderable char in any field', async () => {
    callableImpl = () =>
      Promise.resolve({
        data: {
          questions: [
            {
              id: 'c1',
              prompt: corruptedField('Evaluate'),
              choices: [
                { id: 'a', label: corruptedField('opt') },
                { id: 'b', label: '2x\u0007' },
                { id: 'c', label: 'x\ufffd' },
              ],
              correctChoiceId: 'a',
              explanation: corruptedField('Because'),
              targetConcept: 'limits\ufffd at infinity\u0001',
            },
          ],
        },
      });
    const ai = await importEnabledAi();

    const result = await ai.generateChallengeQuestions({
      sessionQuestions: [
        {
          prompt: 'derivative of $x^2$?',
          choices: [
            { id: 'a', label: '$2x$' },
            { id: 'b', label: '$x$' },
          ],
          correctChoiceId: 'a',
          userChoiceId: 'b',
          isCorrect: false,
        },
      ],
      profileSummary: '',
      count: 1,
    });

    expect(result).not.toBeNull();
    const question = result!.questions[0]!;
    expect(HAS_NON_RENDERABLE.test(question.prompt)).toBe(false);
    expect(HAS_NON_RENDERABLE.test(question.explanation)).toBe(false);
    expect(HAS_NON_RENDERABLE.test(question.targetConcept)).toBe(false);
    expect(question.choices).toHaveLength(3);
    for (const choice of question.choices) {
      expect(HAS_NON_RENDERABLE.test(choice.label)).toBe(false);
      expect(choice.label.length).toBeGreaterThan(0);
    }
  });
});

describe('generateWorkHint cleans the corrupted message', () => {
  it('returns no non-renderable char in the message', async () => {
    callableImpl = () =>
      Promise.resolve({ data: { message: corruptedField('Nice start —'), onTrack: true } });
    const ai = await importEnabledAi();

    const result = await ai.generateWorkHint({
      prompt: 'derivative of $x^2$?',
      choices: ['$2x$', '$x$'],
      correctLabel: '$2x$',
      profileSummary: '',
      workImages: ['data:image/png;base64,AAAA'],
    });

    expect(result).not.toBeNull();
    expect(HAS_NON_RENDERABLE.test(result!.message)).toBe(false);
    expect(result!.message.length).toBeGreaterThan(0);
  });
});
