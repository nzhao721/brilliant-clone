import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateChallengeQuestions,
  generateTutorResponse,
  isAiTutorEnabled,
  prefetchTutorResponses,
  type ChallengeRequestInput,
  type PrefetchTutorInput,
  type TutorMode,
  type TutorRequestInput,
} from './ai';

// These tests cover two worlds:
//  1. The DEFAULT test runner, where AI is intentionally DISABLED (mirroring
//     firebase.ts's test-disable pattern). The statically imported `./ai` above
//     is evaluated in this state, locking in the safety contract every caller
//     relies on: the tutor never activates and never throws, always yielding null
//     so the static fallback is shown. This keeps every other component/hook test
//     green.
//  2. An ENABLED world, exercised by re-importing `./ai` with the env flag on,
//     `firebaseApp` present, and `firebase/functions` mocked, so we can verify the
//     callable wiring (success, error, offline guard, and the onErrorDetail
//     reason) WITHOUT a real network call. This enabling is fully scoped to the
//     dynamic import and undone in afterEach.

// ---- Controllable mocks for the enabled-path tests --------------------------
type CallableResult = { data: unknown };
let callableImpl: () => Promise<CallableResult>;
const callable = vi.fn((_input?: unknown) => callableImpl());
const httpsCallable = vi.fn(() => callable);
const getFunctions = vi.fn(() => ({ app: {}, region: 'us-central1', customDomain: null }));

/** Builds an Error shaped like a Firebase callable error (carries a `code`). */
function makeFunctionsError(code: string, message: string): Error {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

const SAMPLE_INPUT: TutorRequestInput = {
  mode: 'feedback-incorrect',
  prompt: 'What is the derivative of $x^2$?',
  chosenLabel: '$x$',
  correctLabel: '$2x$',
  isCorrect: false,
  staticExplanation: 'Use the power rule.',
  profileSummary: 'Overall accuracy: 60%.',
};

const SAMPLE_PREFETCH_INPUT: PrefetchTutorInput = {
  prompt: 'What is the derivative of $x^2$?',
  choices: [
    { id: 'a', label: '$2x$' },
    { id: 'b', label: '$x$' },
  ],
  correctChoiceId: 'a',
  staticHint: 'Use the power rule.',
  staticCorrectExplanation: 'Correct.',
  staticIncorrectExplanation: 'Not quite.',
  profileSummary: 'Overall accuracy: 60%.',
};

const SAMPLE_CHALLENGE_INPUT: ChallengeRequestInput = {
  sessionQuestions: [
    {
      prompt: 'What is the derivative of $x^2$?',
      choices: [
        { id: 'a', label: '$2x$' },
        { id: 'b', label: '$x$' },
      ],
      correctChoiceId: 'a',
      userChoiceId: 'b',
      isCorrect: false,
      category: 'derivatives',
    },
  ],
  profileSummary: 'Overall accuracy: 50%.',
  count: 2,
};

/** A structurally valid generated question (3 choices, matching correct id). */
function challengeQuestion(id: string) {
  return {
    id,
    prompt: `Question ${id}: derivative of $x^2$?`,
    choices: [
      { id: 'a', label: '$2x$' },
      { id: 'b', label: '$x$' },
      { id: 'c', label: '$x^2$' },
    ],
    correctChoiceId: 'a',
    explanation: 'Power rule gives $2x$.',
    targetConcept: 'derivatives',
  };
}

/** Re-import `./ai` with the AI tutor ENABLED and `firebase/functions` mocked. */
async function importEnabledAi() {
  vi.resetModules();
  vi.stubEnv('VITE_ENABLE_AI_TUTOR', 'true');
  vi.stubEnv('VITE_FIREBASE_ENABLE_TEST_SERVICES', 'true');
  vi.doMock('./firebase', () => ({ firebaseApp: { name: '[DEFAULT]' } }));
  vi.doMock('firebase/functions', () => ({ getFunctions, httpsCallable }));
  return import('./ai');
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

afterEach(() => {
  // Restore the jsdom default (online via the prototype getter).
  delete (window.navigator as { onLine?: boolean }).onLine;
  vi.unstubAllEnvs();
  vi.doUnmock('./firebase');
  vi.doUnmock('firebase/functions');
  vi.resetModules();
  vi.clearAllMocks();
});

describe('isAiTutorEnabled', () => {
  it('is disabled in the test environment', () => {
    expect(isAiTutorEnabled()).toBe(false);
  });
});

describe('generateTutorResponse (disabled in the test runner)', () => {
  const modes: TutorMode[] = ['hint', 'feedback-incorrect', 'encourage-correct'];

  it('resolves to null (never throws) for every mode while disabled', async () => {
    for (const mode of modes) {
      await expect(
        generateTutorResponse({
          ...SAMPLE_INPUT,
          mode,
          isCorrect: mode === 'encourage-correct',
        }),
      ).resolves.toBeNull();
    }
  });

  it('resolves to null when the browser reports offline', async () => {
    setNavigatorOnline(false);

    await expect(generateTutorResponse({ ...SAMPLE_INPUT })).resolves.toBeNull();
  });

  it('reports the disabled reason through the optional callback (still resolving null)', async () => {
    // AI is disabled in the test runner, so the reason is the disabled message —
    // proving the detail is captured without breaking the null-means-static
    // contract every caller relies on.
    const onErrorDetail = vi.fn();

    const response = await generateTutorResponse({ ...SAMPLE_INPUT }, onErrorDetail);

    expect(response).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith(expect.stringMatching(/disabled/i));
  });
});

describe('prefetchTutorResponses (disabled in the test runner)', () => {
  it('resolves to null (never throws) while disabled', async () => {
    await expect(prefetchTutorResponses({ ...SAMPLE_PREFETCH_INPUT })).resolves.toBeNull();
  });

  it('reports the disabled reason through the optional callback (still resolving null)', async () => {
    const onErrorDetail = vi.fn();

    const response = await prefetchTutorResponses({ ...SAMPLE_PREFETCH_INPUT }, onErrorDetail);

    expect(response).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith(expect.stringMatching(/disabled/i));
  });
});

describe('generateChallengeQuestions (disabled in the test runner)', () => {
  it('resolves to null (never throws) while disabled', async () => {
    await expect(generateChallengeQuestions({ ...SAMPLE_CHALLENGE_INPUT })).resolves.toBeNull();
  });

  it('reports the disabled reason through the optional callback (still resolving null)', async () => {
    const onErrorDetail = vi.fn();

    const response = await generateChallengeQuestions({ ...SAMPLE_CHALLENGE_INPUT }, onErrorDetail);

    expect(response).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith(expect.stringMatching(/disabled/i));
  });
});

describe('generateTutorResponse (enabled, callable mocked)', () => {
  beforeEach(() => {
    callableImpl = () => Promise.resolve({ data: { message: 'default' } });
  });

  it('is enabled once the flag, firebaseApp, and services are configured', async () => {
    const ai = await importEnabledAi();
    expect(ai.isAiTutorEnabled()).toBe(true);
  });

  it('calls the callable and returns the parsed tutor response on success', async () => {
    callableImpl = () =>
      Promise.resolve({
        data: {
          message: 'Close — you applied the wrong rule here.',
          misconception: 'confused power rule with constant rule',
        },
      });
    const ai = await importEnabledAi();

    const result = await ai.generateTutorResponse(SAMPLE_INPUT);

    expect(result).toEqual({
      message: 'Close — you applied the wrong rule here.',
      misconception: 'confused power rule with constant rule',
    });
    // Wired to the right region, callable name, and ~8s timeout, with the input forwarded.
    expect(getFunctions).toHaveBeenCalledWith(expect.anything(), 'us-central1');
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'generateTutorFeedback', {
      timeout: 8000,
    });
    expect(callable).toHaveBeenCalledWith(SAMPLE_INPUT);
  });

  it('returns null and reports a concise reason when the callable errors', async () => {
    callableImpl = () =>
      Promise.reject(makeFunctionsError('functions/unavailable', 'OpenAI request failed'));
    const ai = await importEnabledAi();
    const onErrorDetail = vi.fn();

    const result = await ai.generateTutorResponse(SAMPLE_INPUT, onErrorDetail);

    expect(result).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith('OpenAI request failed — functions/unavailable');
  });

  it('returns null and surfaces the sign-in reason when unauthenticated', async () => {
    callableImpl = () =>
      Promise.reject(makeFunctionsError('functions/unauthenticated', 'Sign in to use the AI coach.'));
    const ai = await importEnabledAi();
    const onErrorDetail = vi.fn();

    const result = await ai.generateTutorResponse(SAMPLE_INPUT, onErrorDetail);

    expect(result).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith(expect.stringContaining('functions/unauthenticated'));
  });

  it('honors the offline guard and never calls the function', async () => {
    const ai = await importEnabledAi();
    setNavigatorOnline(false);
    const onErrorDetail = vi.fn();

    const result = await ai.generateTutorResponse(SAMPLE_INPUT, onErrorDetail);

    expect(result).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith('Device is offline');
    expect(httpsCallable).not.toHaveBeenCalled();
    expect(callable).not.toHaveBeenCalled();
  });

  it('returns null when the callable yields an unusable payload', async () => {
    callableImpl = () => Promise.resolve({ data: { message: '   ' } });
    const ai = await importEnabledAi();
    const onErrorDetail = vi.fn();

    const result = await ai.generateTutorResponse(SAMPLE_INPUT, onErrorDetail);

    expect(result).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith('AI returned an empty or unparseable response');
  });

  it('repairs OpenAI null-byte-mangled LaTeX backslashes in the message', async () => {
    // OpenAI structured outputs can drop a LaTeX backslash and leave a NULL
    // byte (U+0000) behind, so `$-\infty$` arrives as `$-\u0000infty$`. The
    // coercion must swap the NULL back to a real backslash so KaTeX renders it.
    callableImpl = () => Promise.resolve({ data: { message: '$-\u0000infty$' } });
    const ai = await importEnabledAi();

    const result = await ai.generateTutorResponse(SAMPLE_INPUT);

    expect(result).toEqual({ message: '$-\\infty$' });
    expect(result?.message).not.toContain('\u0000');
  });

  it('repairs every control char OpenAI leaves behind for mangled LaTeX', async () => {
    // OpenAI's mis-escaped JSON parses LaTeX backslashes into control chars:
    //   \f -> U+000C (\frac), \t -> U+0009 (\to), and invalid escapes such as
    //   \i -> U+0000 (\infty). Build a message with those raw control chars and
    //   assert each command is restored with a real single backslash.
    const mangled =
      '$' +
      String.fromCharCode(12) + // U+000C form feed, was the `\` of \frac
      'rac{1}{x}$ as $x' +
      String.fromCharCode(9) + // U+0009 tab, was the `\` of \to
      'o 0^+$, $' +
      String.fromCharCode(0) + // U+0000 null, was the `\` of \infty
      'infty$';
    callableImpl = () => Promise.resolve({ data: { message: mangled } });
    const ai = await importEnabledAi();

    const result = await ai.generateTutorResponse(SAMPLE_INPUT);

    expect(result).toEqual({ message: '$\\frac{1}{x}$ as $x\\to 0^+$, $\\infty$' });
    expect(result?.message).toContain('\\frac');
    expect(result?.message).toContain('\\to');
    expect(result?.message).toContain('\\infty');
    // No control chars survive the repair.
    // eslint-disable-next-line no-control-regex
    expect(result?.message).not.toMatch(/[\u0000\u0008\u0009\u000c\u000d]/);
  });

  it('repairs the BEL/VT control chars for the \\alpha and \\vec command families', async () => {
    // Regression: the repair map originally omitted BEL (U+0007, the `\a` of
    // \alpha/\approx/\arctan/…) and VT (U+000B, the `\v` of \vec/\varphi/…), two
    // of the most common calculus command families. When OpenAI mangled their
    // backslash into the raw control char, the repair left it untouched and KaTeX
    // rendered a red error box. Build a message with BEL + VT (alongside the
    // already-handled \frac form feed) and assert every command is restored with
    // a single real backslash so KaTeX can render it.
    const mangled =
      '$' +
      String.fromCharCode(7) + // U+0007 bell, was the `\` of \alpha
      'lpha$ and $' +
      String.fromCharCode(11) + // U+000B vertical tab, was the `\` of \vec
      'ec{v}$ with $' +
      String.fromCharCode(12) + // U+000C form feed, was the `\` of \frac
      'rac{1}{2}$';
    callableImpl = () => Promise.resolve({ data: { message: mangled } });
    const ai = await importEnabledAi();

    const result = await ai.generateTutorResponse(SAMPLE_INPUT);

    expect(result).toEqual({ message: '$\\alpha$ and $\\vec{v}$ with $\\frac{1}{2}$' });
    expect(result?.message).toContain('\\alpha');
    expect(result?.message).toContain('\\vec');
    // No control chars survive the repair.
    // eslint-disable-next-line no-control-regex
    expect(result?.message).not.toMatch(/[\u0000\u0007\u0008\u0009\u000b\u000c\u000d]/);
  });
});

describe('prefetchTutorResponses (enabled, callable mocked)', () => {
  beforeEach(() => {
    callableImpl = () => Promise.resolve({ data: { hint: 'h', perChoice: [] } });
  });

  it('calls the prefetch callable and returns the parsed batch on success', async () => {
    callableImpl = () =>
      Promise.resolve({
        data: {
          hint: 'Think about the exponent.',
          perChoice: [
            { choiceId: 'a', message: 'Great — power rule applied.', misconception: null },
            {
              choiceId: 'b',
              message: 'That dropped the exponent.',
              misconception: 'forgot to multiply by the power',
            },
          ],
        },
      });
    const ai = await importEnabledAi();

    const result = await ai.prefetchTutorResponses(SAMPLE_PREFETCH_INPUT);

    expect(result).toEqual({
      hint: 'Think about the exponent.',
      perChoice: [
        { choiceId: 'a', message: 'Great — power rule applied.' },
        {
          choiceId: 'b',
          message: 'That dropped the exponent.',
          misconception: 'forgot to multiply by the power',
        },
      ],
    });
    // Wired to the right region, BATCH callable name, ~8s timeout, input forwarded.
    expect(getFunctions).toHaveBeenCalledWith(expect.anything(), 'us-central1');
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'prefetchTutorFeedback', {
      timeout: 8000,
    });
    expect(callable).toHaveBeenCalledWith(SAMPLE_PREFETCH_INPUT);
  });

  it('repairs mangled LaTeX in the hint AND every per-choice message', async () => {
    callableImpl = () =>
      Promise.resolve({
        data: {
          hint: '$-\u0000infty$',
          perChoice: [{ choiceId: 'a', message: '$\u000crac{1}{x}$', misconception: null }],
        },
      });
    const ai = await importEnabledAi();

    const result = await ai.prefetchTutorResponses(SAMPLE_PREFETCH_INPUT);

    expect(result?.hint).toBe('$-\\infty$');
    expect(result?.perChoice[0]?.message).toBe('$\\frac{1}{x}$');
  });

  it('drops per-choice entries missing a choiceId or message', async () => {
    callableImpl = () =>
      Promise.resolve({
        data: {
          hint: 'A hint.',
          perChoice: [
            { choiceId: 'a', message: 'Kept.' },
            { choiceId: '', message: 'No id.' },
            { choiceId: 'b', message: '   ' },
          ],
        },
      });
    const ai = await importEnabledAi();

    const result = await ai.prefetchTutorResponses(SAMPLE_PREFETCH_INPUT);

    expect(result?.perChoice).toEqual([{ choiceId: 'a', message: 'Kept.' }]);
  });

  it('returns null when neither a hint nor any usable choice is present', async () => {
    callableImpl = () => Promise.resolve({ data: { hint: '   ', perChoice: [] } });
    const ai = await importEnabledAi();
    const onErrorDetail = vi.fn();

    const result = await ai.prefetchTutorResponses(SAMPLE_PREFETCH_INPUT, onErrorDetail);

    expect(result).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith('AI returned an empty or unparseable response');
  });

  it('returns null and reports a concise reason when the prefetch callable errors', async () => {
    callableImpl = () =>
      Promise.reject(makeFunctionsError('functions/unavailable', 'OpenAI request failed'));
    const ai = await importEnabledAi();
    const onErrorDetail = vi.fn();

    const result = await ai.prefetchTutorResponses(SAMPLE_PREFETCH_INPUT, onErrorDetail);

    expect(result).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith('OpenAI request failed — functions/unavailable');
  });

  it('honors the offline guard and never calls the prefetch function', async () => {
    const ai = await importEnabledAi();
    setNavigatorOnline(false);
    const onErrorDetail = vi.fn();

    const result = await ai.prefetchTutorResponses(SAMPLE_PREFETCH_INPUT, onErrorDetail);

    expect(result).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith('Device is offline');
    expect(httpsCallable).not.toHaveBeenCalled();
    expect(callable).not.toHaveBeenCalled();
  });
});

describe('generateChallengeQuestions (enabled, callable mocked)', () => {
  beforeEach(() => {
    callableImpl = () => Promise.resolve({ data: { questions: [] } });
  });

  it('calls the challenge callable and returns the validated questions on success', async () => {
    callableImpl = () =>
      Promise.resolve({ data: { questions: [challengeQuestion('c1'), challengeQuestion('c2')] } });
    const ai = await importEnabledAi();

    const result = await ai.generateChallengeQuestions(SAMPLE_CHALLENGE_INPUT);

    expect(result?.questions).toHaveLength(2);
    expect(result?.questions[0]).toMatchObject({ id: 'c1', correctChoiceId: 'a' });
    // Wired to the right region, challenge callable name, longer timeout, input forwarded.
    expect(getFunctions).toHaveBeenCalledWith(expect.anything(), 'us-central1');
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'generateChallengeQuestions', {
      timeout: 25000,
    });
    expect(callable).toHaveBeenCalledWith(SAMPLE_CHALLENGE_INPUT);
  });

  it('returns only the requested count even when the model overproduces', async () => {
    callableImpl = () =>
      Promise.resolve({
        data: {
          questions: [challengeQuestion('c1'), challengeQuestion('c2'), challengeQuestion('c3')],
        },
      });
    const ai = await importEnabledAi();

    const result = await ai.generateChallengeQuestions(SAMPLE_CHALLENGE_INPUT);

    expect(result?.questions).toHaveLength(2);
  });

  it('drops a question with too few choices and returns null when fewer than count survive', async () => {
    callableImpl = () =>
      Promise.resolve({
        data: {
          questions: [
            challengeQuestion('c1'),
            {
              id: 'c2',
              prompt: 'Only two choices',
              choices: [
                { id: 'a', label: 'x' },
                { id: 'b', label: 'y' },
              ],
              correctChoiceId: 'a',
              explanation: '',
              targetConcept: '',
            },
          ],
        },
      });
    const ai = await importEnabledAi();
    const onErrorDetail = vi.fn();

    const result = await ai.generateChallengeQuestions(SAMPLE_CHALLENGE_INPUT, onErrorDetail);

    expect(result).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith('AI returned an empty or invalid challenge set');
  });

  it('drops a question whose correctChoiceId matches no choice', async () => {
    callableImpl = () =>
      Promise.resolve({
        data: {
          questions: [
            challengeQuestion('c1'),
            { ...challengeQuestion('c2'), correctChoiceId: 'zzz' },
          ],
        },
      });
    const ai = await importEnabledAi();

    // Only one valid question survives, which is < count (2) → null.
    const result = await ai.generateChallengeQuestions(SAMPLE_CHALLENGE_INPUT);

    expect(result).toBeNull();
  });

  it('repairs mangled LaTeX in prompts, choices, explanation, and targetConcept', async () => {
    callableImpl = () =>
      Promise.resolve({
        data: {
          questions: [
            {
              id: 'c1',
              prompt: '$-\u0000infty$',
              choices: [
                { id: 'a', label: '$\u000crac{1}{x}$' },
                { id: 'b', label: '$x$' },
                { id: 'c', label: '$1$' },
              ],
              correctChoiceId: 'a',
              explanation: '$x\u0009o 0$',
              targetConcept: '$\u0000lim$',
            },
            challengeQuestion('c2'),
          ],
        },
      });
    const ai = await importEnabledAi();

    const result = await ai.generateChallengeQuestions(SAMPLE_CHALLENGE_INPUT);

    expect(result?.questions[0]?.prompt).toBe('$-\\infty$');
    expect(result?.questions[0]?.choices[0]?.label).toBe('$\\frac{1}{x}$');
    expect(result?.questions[0]?.explanation).toBe('$x\\to 0$');
    expect(result?.questions[0]?.targetConcept).toBe('$\\lim$');
  });

  it('auto-delimits BARE AI LaTeX in the prompt, choices, and explanation', async () => {
    // The reported bug: the model emits a challenge whose CHOICES are delimited
    // ($\frac{1}{5}$, $\infty$) but whose PROMPT (and one bare choice) carry
    // undelimited LaTeX. The coercion's normalize pass wraps the bare runs so
    // MathText renders them, while leaving prose, plain choices, and the already-
    // delimited choices exactly as-is.
    callableImpl = () =>
      Promise.resolve({
        data: {
          questions: [
            {
              id: 'c1',
              prompt: 'Evaluate the limit \\lim_{n\\to\\infty}\\frac{5}{n}.',
              choices: [
                { id: 'a', label: '\\frac{1}{5}' }, // bare -> wrapped
                { id: 'b', label: '0' }, // plain -> untouched
                { id: 'c', label: '$\\infty$' }, // already delimited -> untouched
              ],
              correctChoiceId: 'b',
              explanation: 'The fraction \\frac{5}{n} shrinks to 0.',
              targetConcept: 'limits at infinity',
            },
            challengeQuestion('c2'),
          ],
        },
      });
    const ai = await importEnabledAi();

    const result = await ai.generateChallengeQuestions(SAMPLE_CHALLENGE_INPUT);

    expect(result?.questions[0]?.prompt).toBe(
      'Evaluate the limit $\\lim_{n\\to\\infty}\\frac{5}{n}$.',
    );
    expect(result?.questions[0]?.choices[0]?.label).toBe('$\\frac{1}{5}$');
    expect(result?.questions[0]?.choices[1]?.label).toBe('0');
    expect(result?.questions[0]?.choices[2]?.label).toBe('$\\infty$');
    expect(result?.questions[0]?.explanation).toBe('The fraction $\\frac{5}{n}$ shrinks to 0.');
    expect(result?.questions[0]?.targetConcept).toBe('limits at infinity');
  });

  it('returns null and reports a concise reason when the callable errors (e.g. over quota)', async () => {
    callableImpl = () =>
      Promise.reject(makeFunctionsError('functions/resource-exhausted', 'HTTP 429 rate limited'));
    const ai = await importEnabledAi();
    const onErrorDetail = vi.fn();

    const result = await ai.generateChallengeQuestions(SAMPLE_CHALLENGE_INPUT, onErrorDetail);

    expect(result).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith('HTTP 429 rate limited — functions/resource-exhausted');
  });

  it('honors the offline guard and never calls the challenge function', async () => {
    const ai = await importEnabledAi();
    setNavigatorOnline(false);
    const onErrorDetail = vi.fn();

    const result = await ai.generateChallengeQuestions(SAMPLE_CHALLENGE_INPUT, onErrorDetail);

    expect(result).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith('Device is offline');
    expect(httpsCallable).not.toHaveBeenCalled();
    expect(callable).not.toHaveBeenCalled();
  });
});
