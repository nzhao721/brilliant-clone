import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkAiAvailability,
  generateChallengeQuestions,
  generateTutorResponse,
  generateWorkHint,
  isAiTutorEnabled,
  prefetchTutorResponses,
  type ChallengeRequestInput,
  type PrefetchTutorInput,
  type TutorMode,
  type TutorRequestInput,
  type WorkHintInput,
} from './ai';

/*
 * These tests cover two worlds:
 *  1. The DEFAULT runner, where AI is DISABLED: the static `./ai` import locks in
 *     the safety contract (never activates, never throws, always null).
 *  2. An ENABLED world (re-import `./ai` with the flag on + `firebase/functions`
 *     mocked) to verify the callable wiring without a real network call.
 */

// Controllable mocks for the enabled-path tests.
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

const SAMPLE_WORK_INPUT: WorkHintInput = {
  prompt: 'What is the derivative of $x^2$?',
  choices: ['$2x$', '$x$', '$x^2$'],
  correctLabel: '$2x$',
  profileSummary: 'Overall accuracy: 60%.',
  workImages: ['data:image/png;base64,AAAA'],
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
    /* AI is disabled here, so the reason is the disabled message — detail captured
     * without breaking the null-means-static contract. */
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

describe('generateWorkHint (disabled in the test runner)', () => {
  it('resolves to null (never throws) while disabled', async () => {
    await expect(generateWorkHint({ ...SAMPLE_WORK_INPUT })).resolves.toBeNull();
  });

  it('reports the disabled reason through the optional callback (still resolving null)', async () => {
    const onErrorDetail = vi.fn();

    const response = await generateWorkHint({ ...SAMPLE_WORK_INPUT }, onErrorDetail);

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

  it('forwards the structured LaTeX message verbatim (no client-side rewriting)', async () => {
    /* The function returns clean, server-validated LaTeX, so the client passes it
     * through byte-for-byte (including commands like \nabla). */
    const message = 'Use $\\frac{d}{dx} e^x = e^x$ and note that $\\nabla f = 0$.';
    callableImpl = () => Promise.resolve({ data: { message } });
    const ai = await importEnabledAi();

    const result = await ai.generateTutorResponse(SAMPLE_INPUT);

    expect(result).toEqual({ message });
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

  it('forwards structured LaTeX verbatim in the hint AND every per-choice message', async () => {
    callableImpl = () =>
      Promise.resolve({
        data: {
          hint: 'Recall $\\frac{d}{dx} x^n = n x^{n-1}$.',
          perChoice: [
            { choiceId: 'a', message: 'Yes — $\\nabla f = 0$ at extrema.', misconception: null },
          ],
        },
      });
    const ai = await importEnabledAi();

    const result = await ai.prefetchTutorResponses(SAMPLE_PREFETCH_INPUT);

    expect(result?.hint).toBe('Recall $\\frac{d}{dx} x^n = n x^{n-1}$.');
    expect(result?.perChoice[0]?.message).toBe('Yes — $\\nabla f = 0$ at extrema.');
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

  it('forwards structured LaTeX verbatim in prompt, choices, and explanation', async () => {
    /* Server LaTeX is clean and delimited, so the client forwards every field
     * byte-for-byte (no repair). */
    callableImpl = () =>
      Promise.resolve({
        data: {
          questions: [
            {
              id: 'c1',
              prompt: 'Evaluate $\\lim_{n\\to\\infty}\\frac{5}{n}$.',
              choices: [
                { id: 'a', label: '$\\frac{1}{5}$' },
                { id: 'b', label: '$0$' },
                { id: 'c', label: '$\\infty$' },
              ],
              correctChoiceId: 'b',
              explanation: 'The fraction $\\frac{5}{n}$ shrinks to $0$.',
              targetConcept: 'limits at infinity',
            },
            challengeQuestion('c2'),
          ],
        },
      });
    const ai = await importEnabledAi();

    const result = await ai.generateChallengeQuestions(SAMPLE_CHALLENGE_INPUT);

    expect(result?.questions[0]?.prompt).toBe('Evaluate $\\lim_{n\\to\\infty}\\frac{5}{n}$.');
    expect(result?.questions[0]?.choices[0]?.label).toBe('$\\frac{1}{5}$');
    expect(result?.questions[0]?.choices[1]?.label).toBe('$0$');
    expect(result?.questions[0]?.choices[2]?.label).toBe('$\\infty$');
    expect(result?.questions[0]?.explanation).toBe('The fraction $\\frac{5}{n}$ shrinks to $0$.');
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

describe('generateWorkHint (enabled, callable mocked)', () => {
  beforeEach(() => {
    callableImpl = () => Promise.resolve({ data: { message: 'Looks good so far.' } });
  });

  it('calls the work-hint callable and returns the parsed response on success', async () => {
    callableImpl = () =>
      Promise.resolve({ data: { message: 'Nice setup — check your second line.', onTrack: true } });
    const ai = await importEnabledAi();

    const result = await ai.generateWorkHint(SAMPLE_WORK_INPUT);

    expect(result).toEqual({ message: 'Nice setup — check your second line.', onTrack: true });
    // Wired to the right region, VISION callable name, longer (challenge-like) timeout, input forwarded.
    expect(getFunctions).toHaveBeenCalledWith(expect.anything(), 'us-central1');
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'generateWorkHintFeedback', {
      timeout: 25000,
    });
    expect(callable).toHaveBeenCalledWith(SAMPLE_WORK_INPUT);
  });

  it('keeps onTrack only when it is a boolean (drops null)', async () => {
    callableImpl = () =>
      Promise.resolve({ data: { message: 'I can’t quite read that — try a clearer photo.', onTrack: null } });
    const ai = await importEnabledAi();

    const result = await ai.generateWorkHint(SAMPLE_WORK_INPUT);

    expect(result).toEqual({ message: 'I can’t quite read that — try a clearer photo.' });
  });

  it('forwards structured LaTeX in the message verbatim', async () => {
    const message = 'Your $\\frac{dy}{dx}$ setup is right; recheck the chain rule next.';
    callableImpl = () => Promise.resolve({ data: { message, onTrack: true } });
    const ai = await importEnabledAi();

    const result = await ai.generateWorkHint(SAMPLE_WORK_INPUT);

    expect(result?.message).toBe(message);
  });

  it('returns null when the payload has no usable message', async () => {
    callableImpl = () => Promise.resolve({ data: { message: '   ' } });
    const ai = await importEnabledAi();
    const onErrorDetail = vi.fn();

    const result = await ai.generateWorkHint(SAMPLE_WORK_INPUT, onErrorDetail);

    expect(result).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith('AI returned an empty or unparseable response');
  });

  it('skips the call entirely when there is no usable work image', async () => {
    const ai = await importEnabledAi();
    const onErrorDetail = vi.fn();

    const result = await ai.generateWorkHint(
      { ...SAMPLE_WORK_INPUT, workImages: ['not-a-data-url'] },
      onErrorDetail,
    );

    expect(result).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith('No usable work image to review');
    expect(callable).not.toHaveBeenCalled();
  });

  it('forwards every uploaded page (a multi-image array) to the callable', async () => {
    const ai = await importEnabledAi();
    const workImages = ['data:image/png;base64,AAAA', 'data:image/jpeg;base64,BBBB'];

    await ai.generateWorkHint({ ...SAMPLE_WORK_INPUT, workImages });

    expect(callable).toHaveBeenCalledWith(expect.objectContaining({ workImages }));
  });

  it('drops non-data-URL entries but still sends the usable ones', async () => {
    const ai = await importEnabledAi();

    await ai.generateWorkHint({
      ...SAMPLE_WORK_INPUT,
      workImages: ['not-a-data-url', 'data:image/png;base64,CCCC'],
    });

    expect(callable).toHaveBeenCalledWith(
      expect.objectContaining({ workImages: ['data:image/png;base64,CCCC'] }),
    );
  });

  it('returns null and reports a concise reason when the callable errors', async () => {
    callableImpl = () =>
      Promise.reject(makeFunctionsError('functions/unavailable', 'OpenAI request failed'));
    const ai = await importEnabledAi();
    const onErrorDetail = vi.fn();

    const result = await ai.generateWorkHint(SAMPLE_WORK_INPUT, onErrorDetail);

    expect(result).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith('OpenAI request failed — functions/unavailable');
  });

  it('honors the offline guard and never calls the function', async () => {
    const ai = await importEnabledAi();
    setNavigatorOnline(false);
    const onErrorDetail = vi.fn();

    const result = await ai.generateWorkHint(SAMPLE_WORK_INPUT, onErrorDetail);

    expect(result).toBeNull();
    expect(onErrorDetail).toHaveBeenCalledWith('Device is offline');
    expect(httpsCallable).not.toHaveBeenCalled();
    expect(callable).not.toHaveBeenCalled();
  });
});

describe('checkAiAvailability (disabled in the test runner)', () => {
  it('reports the disabled reason without any network call', async () => {
    await expect(checkAiAvailability()).resolves.toEqual({
      available: false,
      reason: 'disabled',
    });
  });
});

describe('checkAiAvailability (enabled, callable mocked)', () => {
  beforeEach(() => {
    callableImpl = () => Promise.resolve({ data: { available: true } });
  });

  it('returns available and wires the probe callable when the API is reachable', async () => {
    const ai = await importEnabledAi();

    const result = await ai.checkAiAvailability();

    expect(result).toEqual({ available: true });
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'checkAiAvailability', {
      timeout: 12000,
    });
  });

  it('caches an available result so reopening does not re-probe (≤60s)', async () => {
    const ai = await importEnabledAi();

    await ai.checkAiAvailability();
    await ai.checkAiAvailability();

    // Second call served from cache → the callable ran exactly once.
    expect(callable).toHaveBeenCalledTimes(1);
  });

  it('passes through a server-reported over-quota result', async () => {
    callableImpl = () => Promise.resolve({ data: { available: false, reason: 'over-quota' } });
    const ai = await importEnabledAi();

    await expect(ai.checkAiAvailability()).resolves.toEqual({
      available: false,
      reason: 'over-quota',
    });
  });

  it('maps a 429 / resource-exhausted rejection to over-quota (and never caches it)', async () => {
    callableImpl = () =>
      Promise.reject(makeFunctionsError('functions/resource-exhausted', 'HTTP 429 rate limited'));
    const ai = await importEnabledAi();

    await expect(ai.checkAiAvailability()).resolves.toEqual({
      available: false,
      reason: 'over-quota',
    });
    // A failure is not cached, so a retry probes again.
    await ai.checkAiAvailability();
    expect(callable).toHaveBeenCalledTimes(2);
  });

  it('maps an unauthenticated rejection to signed-out', async () => {
    callableImpl = () =>
      Promise.reject(makeFunctionsError('functions/unauthenticated', 'Sign in to use the AI coach.'));
    const ai = await importEnabledAi();

    await expect(ai.checkAiAvailability()).resolves.toEqual({
      available: false,
      reason: 'signed-out',
    });
  });

  it('maps any other rejection to a generic unavailable', async () => {
    callableImpl = () =>
      Promise.reject(makeFunctionsError('functions/unavailable', 'OpenAI request failed'));
    const ai = await importEnabledAi();

    await expect(ai.checkAiAvailability()).resolves.toEqual({
      available: false,
      reason: 'unavailable',
    });
  });

  it('honors the offline guard and never calls the probe', async () => {
    const ai = await importEnabledAi();
    setNavigatorOnline(false);

    await expect(ai.checkAiAvailability()).resolves.toEqual({
      available: false,
      reason: 'offline',
    });
    expect(callable).not.toHaveBeenCalled();
  });
});
