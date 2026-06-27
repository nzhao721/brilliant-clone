/*
 * Challenge-round generation + validation, kept in its OWN module with NO Firebase
 * imports (and only a TYPE-ONLY OpenAI import) so the generate→grade→filter logic is
 * unit-testable from the app's test runner (mirrors challengeDifficulty.ts).
 *
 * Two AI calls run per request, through an injected client:
 *   1. GENERATOR — authors candidate questions tailored to the learner's weak spots.
 *      The result is validated only STRUCTURALLY (>= MIN_CHALLENGE_CHOICES distinct
 *      choices + a correctChoiceId that matches a choice).
 *   2. GRADER — a SECOND, independent call that re-solves each surviving candidate
 *      FROM SCRATCH (it is never told the generator's marked answer) and reports, per
 *      question, whether it is well-formed and which listed choices are actually
 *      correct. A question is KEPT only when it is well-formed AND exactly one listed
 *      choice is correct AND that choice equals the generator's marked correctChoiceId.
 *      This drops the reported failure mode where NONE of the choices is actually right.
 *
 * Fail-safe: if the grader call throws or returns an empty/unparseable reply, we FAIL
 * OPEN and return the structurally-valid set (today's behavior) so the round still runs.
 */

import type OpenAI from 'openai';
import { challengeDifficultyDirective } from './challengeDifficulty';
import { sanitizeAiLatex } from './latexSanitize';

/* Up to five full questions plus hidden reasoning must fit — far more headroom
 * than the tutor paths — or a truncated reply fails to parse. */
const MAX_CHALLENGE_OUTPUT_TOKENS = 8000;

/* The grader only emits tiny per-question verdicts, but it must RE-SOLVE every
 * candidate (the bulk of the budget is hidden reasoning), so it gets generous
 * headroom while staying well under the generator's. */
const MAX_CHALLENGE_GRADER_OUTPUT_TOKENS = 6000;

// Each generated question must offer at least this many choices (3-4 expected).
const MIN_CHALLENGE_CHOICES = 3;

export interface ChallengeChoiceInput {
  id: string;
  label: string;
}

/* One answered question + the learner's choice and correctness — raw material for
 * inferring weak concepts. */
export interface ChallengeSessionQuestionInput {
  prompt: string;
  choices: ChallengeChoiceInput[];
  correctChoiceId: string;
  userChoiceId: string;
  isCorrect: boolean;
  category?: string;
}

export interface ChallengeRequestInput {
  sessionQuestions: ChallengeSessionQuestionInput[];
  profileSummary: string;
  count: number;
}

export interface ChallengeQuestionOutput {
  id: string;
  prompt: string;
  choices: ChallengeChoiceInput[];
  correctChoiceId: string;
  explanation: string;
  targetConcept: string;
}

export interface ChallengeResponse {
  questions: ChallengeQuestionOutput[];
}

const CHALLENGE_SYSTEM_INSTRUCTION = [
  'You are SlopeWise Coach, an expert calculus item-writer creating a short "challenge round" of NEW multiple-choice questions tailored to ONE learner.',
  'You are given the questions the learner just answered in a mixed practice set; each is marked with the answer the learner chose and whether it was correct.',
  'Goal: design brand-new questions that TARGET the concepts the learner struggled with (inferred from the ones they got wrong), at the TARGET DIFFICULTY (a continuous 0–10 level) specified in the user message — it scales smoothly with how this learner is doing this session (easier when they are struggling, harder when they are excelling). Always keep questions fair, self-contained, and unambiguous.',
  'Rules for EVERY question you write:',
  '- It must be a self-contained, unambiguous calculus multiple-choice question with exactly ONE correct answer.',
  "- Write math as inline KaTeX with single dollar signs, e.g. $\\int_0^1 x^2\\,dx$. Never use display math ($$) or code fences.",
  '- CRITICAL: inside JSON string values, write every LaTeX backslash DOUBLED (\\\\int, \\\\frac, \\\\sqrt, \\\\nabla, \\\\theta), because a single backslash is consumed by JSON escaping and corrupts the command.',
  '- Provide 3 to 4 answer choices, each with a unique id ("a", "b", "c", "d"). Make distractors plausible (reflecting common mistakes), but only ONE may be correct.',
  '- "correctChoiceId" MUST equal the id of the genuinely correct choice. Re-derive the answer yourself and double-check it before finalizing.',
  '- Keep "explanation" concise (1-3 sentences) and set "targetConcept" to a short phrase naming the weak area the question targets.',
  '- Do NOT reuse the learner\'s exact questions; create fresh items on the same weak concepts.',
  '- Always answer with the requested JSON object and nothing else.',
].join('\n');

/* Strict JSON schema for the challenge set. Question and choice counts are
 * enforced in code (parseChallengeResponse), not min/maxItems. */
const CHALLENGE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    questions: {
      type: 'array',
      description:
        'The new challenge questions, exactly as many as requested, each targeting a concept the learner struggled with.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: {
            type: 'string',
            description: 'A short unique id for this question (e.g. "c1", "c2").',
          },
          prompt: {
            type: 'string',
            description:
              'The question text. Self-contained calculus MC question; may use inline $...$ KaTeX with DOUBLED backslashes (e.g. \\\\int, \\\\frac).',
          },
          choices: {
            type: 'array',
            description: '3 to 4 answer choices, each with a unique id and a label.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: {
                  type: 'string',
                  description: 'Unique choice id within this question ("a", "b", "c", "d").',
                },
                label: {
                  type: 'string',
                  description:
                    'The choice text; may use inline $...$ KaTeX with DOUBLED backslashes (e.g. \\\\frac).',
                },
              },
              required: ['id', 'label'],
            },
          },
          correctChoiceId: {
            type: 'string',
            description: 'The id of the single correct choice (must match one of choices).',
          },
          explanation: {
            type: 'string',
            description:
              'Concise (1-3 sentence) explanation of why the correct choice is right. May use inline $...$ KaTeX with DOUBLED backslashes (e.g. \\\\frac).',
          },
          targetConcept: {
            type: 'string',
            description: 'Short phrase naming the weak area this question targets.',
          },
        },
        required: ['id', 'prompt', 'choices', 'correctChoiceId', 'explanation', 'targetConcept'],
      },
    },
  },
  required: ['questions'],
};

export function buildChallengeUserPrompt(input: ChallengeRequestInput): string {
  const correctTotal = input.sessionQuestions.filter((question) => question.isCorrect).length;
  /* Adaptive difficulty: accuracy → a continuous 0–10 target (see challengeDifficultyDirective). */
  const sessionAccuracy =
    input.sessionQuestions.length > 0 ? correctTotal / input.sessionQuestions.length : 0;
  const difficultyDirective = challengeDifficultyDirective(sessionAccuracy);
  const lines: string[] = [
    `Design exactly ${input.count} new challenge question(s).`,
    '',
    'The learner just completed this mixed practice set. Each item shows the choices, the answer the learner picked, and the correct answer:',
  ];

  input.sessionQuestions.forEach((question, index) => {
    const chosen = question.choices.find((choice) => choice.id === question.userChoiceId);
    const correct = question.choices.find((choice) => choice.id === question.correctChoiceId);
    lines.push(
      `Q${index + 1}${question.category ? ` [${question.category}]` : ''}: ${question.prompt}`,
      `  Choices: ${question.choices
        .map((choice) => `(${choice.id}) ${choice.label || '(no label)'}`)
        .join('   ')}`,
      `  Learner chose: ${
        chosen ? `(${chosen.id}) ${chosen.label || '(no label)'}` : '(no answer)'
      } — ${question.isCorrect ? 'CORRECT' : 'INCORRECT'}.`,
      `  Correct answer: ${
        correct
          ? `(${correct.id}) ${correct.label || '(no label)'}`
          : `id "${question.correctChoiceId}"`
      }.`,
    );
  });

  lines.push(
    '',
    `The learner answered ${correctTotal} of ${input.sessionQuestions.length} correctly.`,
    difficultyDirective,
    input.profileSummary
      ? `Learner profile (recent history): ${input.profileSummary}`
      : 'Learner profile: no extra history provided — infer weak areas from the answers above.',
    '',
    `Task: First identify the concepts this learner most struggled with (especially from the questions they got INCORRECT). Then write exactly ${input.count} NEW multiple-choice question(s) that target those weak concepts, AT THE DIFFICULTY DESCRIBED ABOVE. Each question must be self-contained, have 3-4 choices with exactly one unambiguously correct option, set "correctChoiceId" to that option's id, include a concise "explanation", and name the weak area in "targetConcept". Double-check that the option you mark correct really is correct. Return only the JSON object.`,
  );

  return lines.join('\n');
}

/**
 * Parses and STRUCTURALLY validates the challenge reply: validates the LaTeX
 * (downgrading non-renderable spans), drops any question failing the structural
 * contract (>= {@link MIN_CHALLENGE_CHOICES} unique choices + a matching
 * `correctChoiceId`), and synthesizes unique ids. Returns null unless >= `count`
 * survive. (Actual correctness is checked separately by the grader pass.)
 */
export function parseChallengeResponse(rawText: string, count: number): ChallengeResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const candidate = parsed as Record<string, unknown>;
  const rawQuestions: unknown[] = Array.isArray(candidate.questions) ? candidate.questions : [];

  const questions: ChallengeQuestionOutput[] = [];
  const usedQuestionIds = new Set<string>();

  rawQuestions.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const question = entry as Record<string, unknown>;

    const prompt =
      typeof question.prompt === 'string' ? sanitizeAiLatex(question.prompt).trim() : '';
    if (!prompt) {
      return;
    }

    const rawChoices: unknown[] = Array.isArray(question.choices) ? question.choices : [];
    const choices: ChallengeChoiceInput[] = [];
    const seenChoiceIds = new Set<string>();
    for (const choiceEntry of rawChoices) {
      if (!choiceEntry || typeof choiceEntry !== 'object') {
        continue;
      }
      const choice = choiceEntry as Record<string, unknown>;
      const id = typeof choice.id === 'string' ? choice.id.trim() : '';
      const label = typeof choice.label === 'string' ? sanitizeAiLatex(choice.label).trim() : '';
      if (!id || !label || seenChoiceIds.has(id)) {
        continue;
      }
      seenChoiceIds.add(id);
      choices.push({ id, label });
    }

    const correctChoiceId =
      typeof question.correctChoiceId === 'string' ? question.correctChoiceId.trim() : '';

    /* Structural validation: enough distinct choices AND a matching correct id. */
    if (
      choices.length < MIN_CHALLENGE_CHOICES ||
      !choices.some((choice) => choice.id === correctChoiceId)
    ) {
      return;
    }

    const explanation =
      typeof question.explanation === 'string'
        ? sanitizeAiLatex(question.explanation).trim()
        : '';
    const targetConcept =
      typeof question.targetConcept === 'string'
        ? sanitizeAiLatex(question.targetConcept).trim()
        : '';

    /* Keep the model's id when usable + unique; else synthesize a collision-free one. */
    let id = typeof question.id === 'string' ? question.id.trim() : '';
    if (!id || usedQuestionIds.has(id)) {
      id = `challenge-${index + 1}`;
    }
    while (usedQuestionIds.has(id)) {
      id = `${id}-x`;
    }
    usedQuestionIds.add(id);

    questions.push({ id, prompt, choices, correctChoiceId, explanation, targetConcept });
  });

  /* Require at least `count` valid questions, then return exactly `count`. */
  if (questions.length < count) {
    return null;
  }

  return { questions: questions.slice(0, count) };
}

/* ── Grader (independent correctness validation) ─────────────────────────── */

const CHALLENGE_GRADER_SYSTEM_INSTRUCTION = [
  'You are SlopeWise Verifier, a meticulous calculus grader checking AI-written multiple-choice questions BEFORE they reach a student.',
  'You are given a list of candidate questions, each with an id, a prompt, and its answer choices (each choice has an id and a label).',
  'For EACH question, work the problem out yourself FROM SCRATCH — never assume any listed choice is correct — then judge it.',
  'Report, per question:',
  '- "wellFormed": true ONLY if the question is self-contained, unambiguous, and a valid single-answer multiple-choice question (exactly one listed choice can be correct). Otherwise false.',
  '- "correctChoiceIds": the ids of EVERY listed choice that is actually correct according to your OWN solution. Ideally this is exactly one id. Use an EMPTY array if NONE of the listed choices is correct.',
  'Rules:',
  '- Judge ONLY the listed choices, and refer to them by their exact ids.',
  '- Math is written as inline KaTeX with single dollar signs.',
  '- Always answer with the requested JSON object and nothing else.',
].join('\n');

/* Strict JSON schema for the grader. One verdict per candidate question. */
const CHALLENGE_GRADER_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdicts: {
      type: 'array',
      description: 'Exactly one entry per question, using the same question ids.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: {
            type: 'string',
            description: 'The id of the question being judged (copy it exactly).',
          },
          wellFormed: {
            type: 'boolean',
            description:
              'True only if the question is self-contained, unambiguous, and has exactly one correct listed choice.',
          },
          correctChoiceIds: {
            type: 'array',
            description:
              'Ids of all listed choices that are actually correct by your own solution (ideally exactly one; empty if none).',
            items: { type: 'string' },
          },
        },
        required: ['id', 'wellFormed', 'correctChoiceIds'],
      },
    },
  },
  required: ['verdicts'],
};

/* Independent re-solve prompt: lists only the prompt + choices (NOT the generator's
 * marked answer), so the grader's verdict is genuinely independent. */
export function buildChallengeGraderPrompt(questions: ChallengeQuestionOutput[]): string {
  const lines: string[] = [
    `You are given ${questions.length} candidate multiple-choice question(s). Solve and judge EACH one independently.`,
    '',
  ];

  questions.forEach((question) => {
    lines.push(
      `Question id "${question.id}": ${question.prompt}`,
      `  Choices: ${question.choices
        .map((choice) => `(${choice.id}) ${choice.label || '(no label)'}`)
        .join('   ')}`,
      '',
    );
  });

  lines.push(
    'For EACH question, work the problem yourself from scratch, then report:',
    '- "id": the question id, copied exactly.',
    '- "wellFormed": true ONLY if the question is self-contained, unambiguous, and a valid single-answer multiple-choice question; false otherwise.',
    '- "correctChoiceIds": the ids of EVERY listed choice that is genuinely correct by your own solution (ideally exactly one). Use an EMPTY array if NONE of the listed choices is correct.',
    'Judge only the listed choices and use their exact ids. Return one entry per question id and nothing else.',
  );

  return lines.join('\n');
}

export interface ChallengeGraderVerdict {
  wellFormed: boolean;
  correctChoiceIds: string[];
}

/**
 * Parses the grader reply into a map of question id → verdict. Returns null when
 * the reply is unparseable or carries no usable verdicts, which the caller treats
 * as a grader failure (fail-open).
 */
export function parseChallengeGraderVerdicts(
  rawText: string,
): Map<string, ChallengeGraderVerdict> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const rawVerdicts = (parsed as Record<string, unknown>).verdicts;
  if (!Array.isArray(rawVerdicts) || rawVerdicts.length === 0) {
    return null;
  }

  const verdicts = new Map<string, ChallengeGraderVerdict>();
  for (const entry of rawVerdicts) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    if (!id || verdicts.has(id)) {
      continue;
    }
    const correctChoiceIds = Array.isArray(candidate.correctChoiceIds)
      ? candidate.correctChoiceIds
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value): value is string => Boolean(value))
      : [];
    verdicts.set(id, { wellFormed: candidate.wellFormed === true, correctChoiceIds });
  }

  return verdicts.size > 0 ? verdicts : null;
}

/**
 * Applies the grader verdicts to the structurally-valid candidates. A question is
 * KEPT only when its verdict is well-formed AND exactly one of its LISTED choices
 * is graded correct AND that choice equals the generator's marked `correctChoiceId`.
 * Everything else (no verdict, ill-formed, none correct, multiple correct, marked
 * answer wrong) is DROPPED.
 */
export function filterValidatedQuestions(
  candidates: ChallengeQuestionOutput[],
  verdicts: Map<string, ChallengeGraderVerdict>,
): ChallengeQuestionOutput[] {
  return candidates.filter((question) => {
    const verdict = verdicts.get(question.id);
    if (!verdict || !verdict.wellFormed) {
      return false;
    }
    const realChoiceIds = new Set(question.choices.map((choice) => choice.id));
    // Restrict to real choice ids and dedupe so hallucinated/dup ids can't fool the count.
    const correct = [...new Set(verdict.correctChoiceIds)].filter((id) => realChoiceIds.has(id));
    return correct.length === 1 && correct[0] === question.correctChoiceId;
  });
}

/**
 * Runs the GRADER pass over the structurally-valid candidates and returns only the
 * questions that pass {@link filterValidatedQuestions}. FAILS OPEN — returns the
 * candidates unchanged — when the grader call throws or yields an empty/unparseable
 * reply, so a grader outage degrades to today's behavior rather than killing the round.
 */
export async function validateChallengeQuestions(
  candidates: ChallengeQuestionOutput[],
  client: OpenAI,
  model: string,
): Promise<ChallengeQuestionOutput[]> {
  if (candidates.length === 0) {
    return candidates;
  }

  let graderText = '';
  try {
    const response = await client.responses.create({
      model,
      instructions: CHALLENGE_GRADER_SYSTEM_INSTRUCTION,
      input: buildChallengeGraderPrompt(candidates),
      max_output_tokens: MAX_CHALLENGE_GRADER_OUTPUT_TOKENS,
      reasoning: { effort: 'low' },
      text: {
        format: {
          type: 'json_schema',
          name: 'challenge_grader',
          schema: CHALLENGE_GRADER_JSON_SCHEMA,
          strict: true,
        },
      },
    });
    graderText = response.output_text ?? '';
  } catch {
    // Grader transport/provider failure → fail open to the structurally-valid set.
    return candidates;
  }

  const verdicts = parseChallengeGraderVerdicts(graderText);
  if (!verdicts) {
    // Empty/unparseable grader reply → fail open as well.
    return candidates;
  }

  return filterValidatedQuestions(candidates, verdicts);
}

/* Discriminated result so the caller can map a failed STRUCTURAL parse to the same
 * HttpsError (with the incomplete-response suffix) it raised before. */
export type ChallengeGenerationOutcome =
  | { ok: true; questions: ChallengeQuestionOutput[] }
  | { ok: false; response: unknown };

/**
 * Full challenge pipeline through an injected client: GENERATE candidates, validate
 * them STRUCTURALLY, then run the GRADER pass and keep only the genuinely-correct
 * questions. Returns `{ ok: false, response }` when the generator's reply has fewer
 * than `count` structurally-valid questions (the caller turns this into the existing
 * `failed-precondition` error); otherwise `{ ok: true, questions }` with the
 * surviving set — possibly FEWER than `count` (the client backfills empty slots).
 * Provider errors from the generator call propagate to the caller.
 */
export async function generateValidatedChallengeQuestions(
  input: ChallengeRequestInput,
  client: OpenAI,
  model: string,
): Promise<ChallengeGenerationOutcome> {
  const response = await client.responses.create({
    model,
    instructions: CHALLENGE_SYSTEM_INSTRUCTION,
    input: buildChallengeUserPrompt(input),
    max_output_tokens: MAX_CHALLENGE_OUTPUT_TOKENS,
    reasoning: { effort: 'low' },
    text: {
      format: {
        type: 'json_schema',
        name: 'challenge_questions',
        schema: CHALLENGE_JSON_SCHEMA,
        strict: true,
      },
    },
  });

  const parsed = parseChallengeResponse(response.output_text ?? '', input.count);
  if (!parsed) {
    return { ok: false, response };
  }

  const questions = await validateChallengeQuestions(parsed.questions, client, model);
  return { ok: true, questions };
}
