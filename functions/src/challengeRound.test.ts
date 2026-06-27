import { describe, expect, it, vi } from 'vitest';
import {
  filterValidatedQuestions,
  generateValidatedChallengeQuestions,
  parseChallengeGraderVerdicts,
  validateChallengeQuestions,
  type ChallengeGraderVerdict,
  type ChallengeQuestionOutput,
  type ChallengeRequestInput,
} from './challengeRound';

/*
 * Functions-side validation tests. The OpenAI client is INJECTED, so both calls —
 * the GENERATOR (text.format.name 'challenge_questions') and the GRADER
 * ('challenge_grader') — are mocked via a single vi.fn on `responses.create`,
 * with no Firebase/OpenAI runtime imports needed (mirrors how the app's other
 * unit tests stub the network boundary).
 */

/** A structurally-valid generated question (3 choices, marked `correctChoiceId`). */
function candidate(id: string, correctChoiceId = 'a'): ChallengeQuestionOutput {
  return {
    id,
    prompt: `Question ${id}: what is the derivative of $x^2$?`,
    choices: [
      { id: 'a', label: '$2x$' },
      { id: 'b', label: '$x$' },
      { id: 'c', label: '$x^2$' },
    ],
    correctChoiceId,
    explanation: 'Power rule gives $2x$.',
    targetConcept: 'derivatives',
  };
}

type CreateBody = { text?: { format?: { name?: string } }; input?: string };
type GraderClient = Parameters<typeof validateChallengeQuestions>[1];
type GenerateClient = Parameters<typeof generateValidatedChallengeQuestions>[1];

/** A mock client whose grader call returns `graderOutput` (serialized as JSON). */
function graderClient(graderOutput: unknown) {
  const create = vi.fn((_body: CreateBody) =>
    Promise.resolve({ output_text: JSON.stringify(graderOutput) }),
  );
  return { client: { responses: { create } } as unknown as GraderClient, create };
}

/** A mock client whose grader call returns the given RAW (possibly invalid) text. */
function rawGraderClient(outputText: string) {
  const create = vi.fn((_body: CreateBody) => Promise.resolve({ output_text: outputText }));
  return { client: { responses: { create } } as unknown as GraderClient, create };
}

/**
 * A mock client that answers BOTH calls: the generator (returns `generatorOutput`)
 * and the grader (returns `graderOutput`), routed by the request's schema name.
 */
function generatorClient(generatorOutput: unknown, graderOutput: unknown) {
  const create = vi.fn((body: CreateBody) => {
    const name = body?.text?.format?.name;
    if (name === 'challenge_grader') {
      return Promise.resolve({ output_text: JSON.stringify(graderOutput) });
    }
    return Promise.resolve({ output_text: JSON.stringify(generatorOutput) });
  });
  return { client: { responses: { create } } as unknown as GenerateClient, create };
}

const SAMPLE_INPUT: ChallengeRequestInput = {
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
  count: 3,
};

describe('validateChallengeQuestions (grader pass, client mocked)', () => {
  it('keeps a question the grader agrees is correct (exactly one correct, matches marked)', async () => {
    const candidates = [candidate('c1', 'a')];
    const { client, create } = graderClient({
      verdicts: [{ id: 'c1', wellFormed: true, correctChoiceIds: ['a'] }],
    });

    const result = await validateChallengeQuestions(candidates, client, 'gpt-test');

    expect(result.map((question) => question.id)).toEqual(['c1']);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('drops a question whose marked answer the grader says is wrong', async () => {
    const candidates = [candidate('c1', 'a')]; // generator marked "a"
    const { client } = graderClient({
      verdicts: [{ id: 'c1', wellFormed: true, correctChoiceIds: ['b'] }], // grader solves to "b"
    });

    const result = await validateChallengeQuestions(candidates, client, 'gpt-test');

    expect(result).toEqual([]);
  });

  it('drops a question where NONE of the listed choices is correct (the reported bug)', async () => {
    const candidates = [candidate('c1', 'a')];
    const { client } = graderClient({
      verdicts: [{ id: 'c1', wellFormed: true, correctChoiceIds: [] }], // grader: no choice is right
    });

    const result = await validateChallengeQuestions(candidates, client, 'gpt-test');

    expect(result).toEqual([]);
  });

  it('drops a question the grader finds has more than one correct choice', async () => {
    const candidates = [candidate('c1', 'a')];
    const { client } = graderClient({
      verdicts: [{ id: 'c1', wellFormed: true, correctChoiceIds: ['a', 'b'] }],
    });

    const result = await validateChallengeQuestions(candidates, client, 'gpt-test');

    expect(result).toEqual([]);
  });

  it('drops an ill-formed question even when exactly one choice matches the marked one', async () => {
    const candidates = [candidate('c1', 'a')];
    const { client } = graderClient({
      verdicts: [{ id: 'c1', wellFormed: false, correctChoiceIds: ['a'] }],
    });

    const result = await validateChallengeQuestions(candidates, client, 'gpt-test');

    expect(result).toEqual([]);
  });

  it('drops any candidate the grader returned no verdict for', async () => {
    const candidates = [candidate('c1', 'a'), candidate('c2', 'a')];
    const { client } = graderClient({
      verdicts: [{ id: 'c1', wellFormed: true, correctChoiceIds: ['a'] }], // c2 missing
    });

    const result = await validateChallengeQuestions(candidates, client, 'gpt-test');

    expect(result.map((question) => question.id)).toEqual(['c1']);
  });

  it('FAILS OPEN to the structural set when the grader call throws', async () => {
    const candidates = [candidate('c1', 'a'), candidate('c2', 'a')];
    const create = vi.fn(() => Promise.reject(new Error('grader provider down')));
    const client = { responses: { create } } as unknown as GraderClient;

    const result = await validateChallengeQuestions(candidates, client, 'gpt-test');

    expect(result).toEqual(candidates);
  });

  it('FAILS OPEN when the grader reply is unparseable', async () => {
    const candidates = [candidate('c1', 'a')];
    const { client } = rawGraderClient('not json {');

    const result = await validateChallengeQuestions(candidates, client, 'gpt-test');

    expect(result).toEqual(candidates);
  });

  it('FAILS OPEN when the grader returns an empty verdict list', async () => {
    const candidates = [candidate('c1', 'a')];
    const { client } = graderClient({ verdicts: [] });

    const result = await validateChallengeQuestions(candidates, client, 'gpt-test');

    expect(result).toEqual(candidates);
  });

  it('does not call the grader when there are no candidates', async () => {
    const { client, create } = graderClient({ verdicts: [] });

    const result = await validateChallengeQuestions([], client, 'gpt-test');

    expect(result).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('generateValidatedChallengeQuestions (generator + grader, both mocked)', () => {
  it('returns only the grader-approved questions — fewer than count is allowed', async () => {
    const generatorOutput = {
      questions: [candidate('c1', 'a'), candidate('c2', 'a'), candidate('c3', 'a')],
    };
    const graderOutput = {
      verdicts: [
        { id: 'c1', wellFormed: true, correctChoiceIds: ['a'] }, // keep
        { id: 'c2', wellFormed: true, correctChoiceIds: ['b'] }, // marked "a" but graded "b" → drop
        { id: 'c3', wellFormed: true, correctChoiceIds: ['a'] }, // keep
      ],
    };
    const { client, create } = generatorClient(generatorOutput, graderOutput);

    const outcome = await generateValidatedChallengeQuestions(SAMPLE_INPUT, client, 'gpt-test');

    expect(outcome.ok).toBe(true);
    // Only 2 of the requested 3 survive — returned as-is (the client backfills the gap).
    expect(outcome.ok && outcome.questions.map((question) => question.id)).toEqual(['c1', 'c3']);
    // Both the generator and the grader calls were made.
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('asks the grader to re-solve independently (no marked answer leaked into its prompt)', async () => {
    const generatorOutput = { questions: [candidate('c1', 'a')] };
    // count=1 here so a single structurally-valid question passes the parse.
    const graderOutput = { verdicts: [{ id: 'c1', wellFormed: true, correctChoiceIds: ['a'] }] };
    const { client, create } = generatorClient(generatorOutput, graderOutput);

    await generateValidatedChallengeQuestions({ ...SAMPLE_INPUT, count: 1 }, client, 'gpt-test');

    const graderCall = create.mock.calls.find(
      (call) => (call[0] as CreateBody)?.text?.format?.name === 'challenge_grader',
    );
    const graderInput = (graderCall?.[0] as CreateBody | undefined)?.input ?? '';
    expect(graderInput).toContain('Question id "c1"');
    expect(graderInput).toContain('(a) $2x$');
    // The generator's marked answer / answer-revealing explanation is withheld, so
    // the grader must re-solve from scratch (no "(CORRECT)" tag, no explanation).
    expect(graderInput).not.toContain('Power rule gives');
    expect(graderInput).not.toContain('(CORRECT)');
  });

  it('keeps every question when the grader approves them all', async () => {
    const generatorOutput = {
      questions: [candidate('c1', 'a'), candidate('c2', 'a'), candidate('c3', 'a')],
    };
    const graderOutput = {
      verdicts: [
        { id: 'c1', wellFormed: true, correctChoiceIds: ['a'] },
        { id: 'c2', wellFormed: true, correctChoiceIds: ['a'] },
        { id: 'c3', wellFormed: true, correctChoiceIds: ['a'] },
      ],
    };
    const { client } = generatorClient(generatorOutput, graderOutput);

    const outcome = await generateValidatedChallengeQuestions(SAMPLE_INPUT, client, 'gpt-test');

    expect(outcome.ok && outcome.questions.map((question) => question.id)).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
  });

  it('reports ok:false (and skips the grader) when fewer than count are structurally valid', async () => {
    // count=3 but the generator yields only one usable question.
    const generatorOutput = { questions: [candidate('c1', 'a')] };
    const { client, create } = generatorClient(generatorOutput, { verdicts: [] });

    const outcome = await generateValidatedChallengeQuestions(SAMPLE_INPUT, client, 'gpt-test');

    expect(outcome.ok).toBe(false);
    expect(create).toHaveBeenCalledTimes(1); // generator only; grader never runs
  });

  it('FAILS OPEN to the full structural set when the grader errors mid-pipeline', async () => {
    const create = vi.fn((body: CreateBody) => {
      if (body?.text?.format?.name === 'challenge_grader') {
        return Promise.reject(new Error('grader down'));
      }
      return Promise.resolve({
        output_text: JSON.stringify({
          questions: [candidate('c1', 'a'), candidate('c2', 'a'), candidate('c3', 'a')],
        }),
      });
    });
    const client = { responses: { create } } as unknown as GenerateClient;

    const outcome = await generateValidatedChallengeQuestions(SAMPLE_INPUT, client, 'gpt-test');

    expect(outcome.ok && outcome.questions.map((question) => question.id)).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
  });

  it('propagates a generator provider error (the caller maps it to HttpsError)', async () => {
    const create = vi.fn(() => Promise.reject(new Error('HTTP 429 rate limited')));
    const client = { responses: { create } } as unknown as GenerateClient;

    await expect(
      generateValidatedChallengeQuestions(SAMPLE_INPUT, client, 'gpt-test'),
    ).rejects.toThrow('HTTP 429 rate limited');
  });
});

describe('parseChallengeGraderVerdicts', () => {
  it('parses verdicts into a map keyed by question id', () => {
    const verdicts = parseChallengeGraderVerdicts(
      JSON.stringify({
        verdicts: [
          { id: 'c1', wellFormed: true, correctChoiceIds: ['a'] },
          { id: 'c2', wellFormed: false, correctChoiceIds: [] },
        ],
      }),
    );

    expect(verdicts?.get('c1')).toEqual({ wellFormed: true, correctChoiceIds: ['a'] });
    expect(verdicts?.get('c2')).toEqual({ wellFormed: false, correctChoiceIds: [] });
  });

  it('returns null for invalid JSON or an empty/missing verdict list', () => {
    expect(parseChallengeGraderVerdicts('not json')).toBeNull();
    expect(parseChallengeGraderVerdicts(JSON.stringify({ verdicts: [] }))).toBeNull();
    expect(parseChallengeGraderVerdicts(JSON.stringify({}))).toBeNull();
  });
});

describe('filterValidatedQuestions', () => {
  const verdicts = new Map<string, ChallengeGraderVerdict>([
    ['keep', { wellFormed: true, correctChoiceIds: ['a'] }],
    ['wrong-marked', { wellFormed: true, correctChoiceIds: ['b'] }],
    ['none', { wellFormed: true, correctChoiceIds: [] }],
    ['multi', { wellFormed: true, correctChoiceIds: ['a', 'b'] }],
    ['ill-formed', { wellFormed: false, correctChoiceIds: ['a'] }],
  ]);

  it('keeps only well-formed questions with exactly one correct choice matching the marked id', () => {
    const candidates = [
      candidate('keep', 'a'),
      candidate('wrong-marked', 'a'),
      candidate('none', 'a'),
      candidate('multi', 'a'),
      candidate('ill-formed', 'a'),
      candidate('no-verdict', 'a'),
    ];

    const kept = filterValidatedQuestions(candidates, verdicts).map((question) => question.id);

    expect(kept).toEqual(['keep']);
  });
});
