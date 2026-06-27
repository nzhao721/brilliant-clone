import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import OpenAI from 'openai';
import { challengeDifficultyDirective } from './challengeDifficulty';
import { sanitizeAiLatex } from './latexSanitize';

/*
 * SlopeWise AI tutor proxy (OpenAI). These 2nd-gen callables are the ONLY place
 * the paid key is used. The client always has a static fallback, so any failure
 * here just shows static text.
 */

// Must match REGION in src/lib/ai.ts (2nd-gen default is us-central1).
const REGION = 'us-central1';

// Default model; override with OPENAI_TUTOR_MODEL (cheaper: 'gpt-5.4-nano').
const DEFAULT_TUTOR_MODEL = 'gpt-5.4-mini';
const TUTOR_MODEL = process.env.OPENAI_TUTOR_MODEL?.trim() || DEFAULT_TUTOR_MODEL;

/* VISION model for the "review my work" hint. The gpt-5.4 family is multimodal on
 * the responses API, so we reuse the same default as the text tutor; override with
 * OPENAI_WORK_HINT_MODEL if a cheaper/different vision-capable model is preferred. */
const DEFAULT_WORK_HINT_MODEL = 'gpt-5.4-mini';
const WORK_HINT_MODEL = process.env.OPENAI_WORK_HINT_MODEL?.trim() || DEFAULT_WORK_HINT_MODEL;

/* Vision review is a 2-3 sentence reply; the budget is shared with low-effort
 * reasoning, so keep enough headroom that reasoning can't starve the message. */
const MAX_WORK_HINT_OUTPUT_TOKENS = 2000;

/* Defensive server-side cap on the work image's base64 data URL (the client caps
 * far lower); rejects an oversized payload before it ever reaches OpenAI. */
const MAX_WORK_IMAGE_DATA_URL_LENGTH = 8_000_000;

/* Reasoning shares this budget with the reply, so keep it high enough that
 * reasoning can't consume it all and leave an empty message. */
const MAX_OUTPUT_TOKENS = 1500;

/* The BATCH prefetch emits a hint + one message per choice in one call, so it
 * needs far more headroom or reasoning truncates it. */
const MAX_PREFETCH_OUTPUT_TOKENS = 4000;

/* Bound as a Firebase secret (never hardcoded, never sent to the browser):
 *   npx firebase-tools@latest functions:secrets:set OPENAI_API_KEY */
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

type TutorMode = 'hint' | 'feedback-incorrect' | 'encourage-correct';

interface TutorRequestInput {
  mode: TutorMode;
  prompt: string;
  chosenLabel: string;
  correctLabel: string;
  isCorrect: boolean;
  /** The existing static explanation/hint — context the model should improve on. */
  staticExplanation: string;
  /** Compact history summary from the client (may be empty). */
  profileSummary: string;
  /**
   * For HINTS on lesson steps with an on-screen interactive: a short description
   * (widget name + label) so the hint can explain HOW to use it.
   */
  visualHint?: string;
}

interface TutorResponse {
  message: string;
  misconception?: string;
}

/* Ported verbatim from the previous client so the tutor's voice is unchanged. */
const TUTOR_SYSTEM_INSTRUCTION = [
  'You are SlopeWise Coach, an encouraging and concise calculus tutor inside a learning app.',
  'Your job is to help a student understand WHY an answer is right or wrong and to keep them motivated.',
  'Style rules:',
  '- Be warm, specific, and brief. Keep "message" to at most 2-3 short sentences.',
  '- You may write inline math with single dollar signs, e.g. $f\'(x) = 2x$. Never use display math ($$) or code fences.',
  '- CRITICAL: inside JSON string values, write every LaTeX backslash DOUBLED (\\\\frac, \\\\sqrt, \\\\nabla, \\\\int, \\\\theta), because a single backslash is consumed by JSON escaping and corrupts the command.',
  '- Speak directly to the student ("you").',
  '- Only reference the student\'s history when a profile summary is provided; never invent facts about them.',
  '- Always answer with the requested JSON object and nothing else.',
].join('\n');

/* Strict JSON schema. `misconception` is nullable+required (strict mode needs
 * every property); the server drops null/empty before returning. */
const TUTOR_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    message: {
      type: 'string',
      description:
        'The tutor reply shown to the student. 2-3 short sentences. May use inline $...$ math; write LaTeX with DOUBLED backslashes (e.g. \\\\frac, \\\\nabla).',
    },
    misconception: {
      type: ['string', 'null'],
      description:
        'For wrong answers: a few words naming the specific misconception. Use null otherwise.',
    },
  },
  required: ['message', 'misconception'],
};

const VALID_MODES: readonly TutorMode[] = ['hint', 'feedback-incorrect', 'encourage-correct'];

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Validates `request.data` into a {@link TutorRequestInput}; throws `invalid-argument` if unusable. */
function parseInput(data: unknown): TutorRequestInput {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Expected a tutor request object.');
  }

  const raw = data as Record<string, unknown>;
  const mode = raw.mode;
  if (typeof mode !== 'string' || !VALID_MODES.includes(mode as TutorMode)) {
    throw new HttpsError('invalid-argument', `Unknown tutor mode: ${String(mode)}`);
  }

  const prompt = asString(raw.prompt).trim();
  if (!prompt) {
    throw new HttpsError('invalid-argument', 'A non-empty "prompt" is required.');
  }

  const visualHint = asString(raw.visualHint).trim();

  return {
    mode: mode as TutorMode,
    prompt,
    chosenLabel: asString(raw.chosenLabel),
    correctLabel: asString(raw.correctLabel),
    isCorrect: raw.isCorrect === true,
    staticExplanation: asString(raw.staticExplanation),
    profileSummary: asString(raw.profileSummary),
    ...(visualHint ? { visualHint } : {}),
  };
}

// Ported verbatim from the previous client implementation so prompts are identical.
function buildUserPrompt(input: TutorRequestInput): string {
  const lines: string[] = [
    `Question: ${input.prompt}`,
    `The student's chosen answer: ${input.chosenLabel || '(none yet)'}`,
    `The correct answer: ${input.correctLabel}`,
    `Reference explanation (do NOT repeat this verbatim): ${input.staticExplanation || '(none provided)'}`,
    input.profileSummary
      ? `Learner profile (recent history): ${input.profileSummary}`
      : 'Learner profile: no history yet — keep it general.',
  ];

  if (input.visualHint) {
    lines.push(
      `On-screen interactive the student can use right now: ${input.visualHint}`,
    );
  }

  lines.push('');

  switch (input.mode) {
    case 'feedback-incorrect':
      lines.push(
        'Task: The student answered INCORRECTLY. In "message", diagnose the SPECIFIC mistake behind THEIR chosen answer (not a generic restatement of the reference) and gently steer them toward the right idea without shaming them. If their profile shows a recurring pattern related to this error, connect to it briefly. In "misconception", name the specific misconception in a few words.',
      );
      break;
    case 'encourage-correct':
      lines.push(
        'Task: The student answered CORRECTLY. In "message", give brief, genuine, SPECIFIC praise (1-2 sentences). If their profile shows a streak, rising accuracy, or improvement on a topic they previously struggled with, call that out specifically. Omit "misconception".',
      );
      break;
    case 'hint':
      lines.push(
        'Task: The student wants a HINT before answering. In "message", give ONE nudge toward the right approach. If an on-screen interactive is described above, explain CONCRETELY how the student can use that interactive to make progress toward the answer — name what to drag/adjust and what to watch happen (e.g. "drag the point near $x = \\dots$ and watch how the slope of the tangent changes"). Do NOT reveal the correct answer and do NOT perform the final step for them. Omit "misconception".',
      );
      break;
  }

  return lines.join('\n');
}

function parseTutorResponse(rawText: string): TutorResponse | null {
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
  /* Validate the LaTeX (downgrading any non-renderable span to plain text) BEFORE
   * the empty-check/trim. */
  const message =
    typeof candidate.message === 'string' ? sanitizeAiLatex(candidate.message).trim() : '';
  if (!message) {
    return null;
  }

  const response: TutorResponse = { message };

  if (typeof candidate.misconception === 'string') {
    const misconception = sanitizeAiLatex(candidate.misconception).trim();
    if (misconception) {
      response.misconception = misconception;
    }
  }

  return response;
}

// Reuse one client across warm invocations (the secret is constant per instance).
let cachedClient: OpenAI | null = null;
function getOpenAiClient(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: OPENAI_API_KEY.value() });
  }
  return cachedClient;
}

/** Concise, non-sensitive description of an OpenAI failure for the client note. */
function describeOpenAiError(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    const status = typeof error.status === 'number' ? `HTTP ${error.status}` : '';
    return [status, error.message].filter(Boolean).join(' ') || 'OpenAI request failed';
  }
  if (error instanceof Error) {
    return error.message || 'OpenAI request failed';
  }
  return 'OpenAI request failed';
}

/** Builds the "(status: …, reason: …)" suffix for an empty/incomplete reply. */
function describeIncompleteResponse(response: unknown): string {
  const status = (response as { status?: string }).status ?? 'unknown';
  const reason =
    (response as { incomplete_details?: { reason?: string } }).incomplete_details?.reason ?? '';
  return `(status: ${status}${reason ? `, reason: ${reason}` : ''})`;
}

/**
 * Callable tutor proxy. Requires a signed-in user (auth protects the paid key, as
 * App Check isn't set up). Returns a {@link TutorResponse}; throws
 * {@link HttpsError} on auth/validation/provider failures.
 */
export const generateTutorFeedback = onCall(
  {
    region: REGION,
    secrets: [OPENAI_API_KEY],
    // Cap concurrency to protect the paid key from runaway cost.
    maxInstances: 10,
    timeoutSeconds: 30,
  },
  async (request: CallableRequest<unknown>): Promise<TutorResponse> => {
    // Auth gate protecting the paid key (App Check isn't configured here).
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to use the AI coach.');
    }

    const input = parseInput(request.data);

    try {
      const client = getOpenAiClient();
      const response = await client.responses.create({
        model: TUTOR_MODEL,
        instructions: TUTOR_SYSTEM_INSTRUCTION,
        input: buildUserPrompt(input),
        max_output_tokens: MAX_OUTPUT_TOKENS,
        /* Keep effort low so the short reply isn't starved ('minimal' isn't valid
         * for gpt-5.4-mini). */
        reasoning: { effort: 'low' },
        text: {
          format: {
            type: 'json_schema',
            name: 'tutor_response',
            schema: TUTOR_JSON_SCHEMA,
            /* strict:true keeps the call fast and guarantees parseable output. The
             * LaTeX comes through clean, so sanitizeAiLatex is just a KaTeX-validate
             * safety net. */
            strict: true,
          },
        },
      });

      const parsed = parseTutorResponse(response.output_text ?? '');
      if (!parsed) {
        /* Non-'internal' code so the message reaches the client (Firebase scrubs
         * 'internal'); the suffix gives the empty/incomplete reason. */
        throw new HttpsError(
          'failed-precondition',
          `AI returned an empty or unparseable response ${describeIncompleteResponse(response)}.`,
        );
      }
      return parsed;
    } catch (error) {
      /* Re-throw our typed errors; wrap provider errors as 'unavailable'. */
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('unavailable', describeOpenAiError(error));
    }
  },
);

/*
 * BATCH prefetch (prefetchTutorFeedback): pre-generates ALL of one question's
 * coaching in a SINGLE call (hint + a message per choice) so the client caches it
 * and responds instantly. Same contract as generateTutorFeedback; only the prompt,
 * schema, and (larger) token budget differ.
 */

interface PrefetchChoiceInput {
  id: string;
  label: string;
}

interface PrefetchRequestInput {
  prompt: string;
  /** Every answer choice for the question (id + label). */
  choices: PrefetchChoiceInput[];
  /** Id of the correct choice (must match one of `choices`). */
  correctChoiceId: string;
  /** Existing static hint — context the model should improve on (optional). */
  staticHint?: string;
  /** Static explanation shown for the correct answer (optional). */
  staticCorrectExplanation?: string;
  /** Static explanation shown for a wrong answer (optional). */
  staticIncorrectExplanation?: string;
  /** Compact history summary from the client (may be empty). */
  profileSummary: string;
  /** Description of an on-screen interactive, for the HINT only (optional). */
  visualHint?: string;
}

interface PrefetchPerChoice {
  choiceId: string;
  message: string;
  misconception?: string;
}

interface PrefetchResponse {
  hint: string;
  perChoice: PrefetchPerChoice[];
}

/* Hard cap on choices so a malformed request can't blow up cost. Real questions
 * have 2-5. */
const MAX_PREFETCH_CHOICES = 8;

/* Voice identical to TUTOR_SYSTEM_INSTRUCTION; only the task framing differs. */
const PREFETCH_SYSTEM_INSTRUCTION = [
  'You are SlopeWise Coach, an encouraging and concise calculus tutor inside a learning app.',
  'You are preparing ALL of the coaching for ONE multiple-choice question in advance: a single hint, plus one short feedback message for EACH answer choice.',
  'Your job is to help a student understand WHY an answer is right or wrong and to keep them motivated.',
  'Style rules:',
  '- Be warm, specific, and brief. Keep the hint and EACH message to at most 2-3 short sentences.',
  "- You may write inline math with single dollar signs, e.g. $f'(x) = 2x$. Never use display math ($$) or code fences.",
  '- CRITICAL: inside JSON string values, write every LaTeX backslash DOUBLED (\\\\frac, \\\\sqrt, \\\\nabla, \\\\int, \\\\theta), because a single backslash is consumed by JSON escaping and corrupts the command.',
  '- Speak directly to the student ("you").',
  "- Only reference the student's history when a profile summary is provided; never invent facts about them.",
  '- Always answer with the requested JSON object and nothing else.',
].join('\n');

/* Strict JSON schema for the batch. `misconception` is nullable+required (server
 * drops null/empty); per-choice count is enforced in code (no min/maxItems). */
const PREFETCH_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hint: {
      type: 'string',
      description:
        'One nudge toward the right approach, shown BEFORE the student answers. 2-3 short sentences. Must NOT reveal which choice is correct. May use inline $...$ math; write LaTeX with DOUBLED backslashes (e.g. \\\\frac, \\\\nabla).',
    },
    perChoice: {
      type: 'array',
      description:
        'Exactly one entry for EACH answer choice, in the same order, using the same choiceId values.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          choiceId: {
            type: 'string',
            description: 'The id of the answer choice this message is for (copy it exactly).',
          },
          message: {
            type: 'string',
            description:
              'The feedback shown if the student picks THIS choice. 2-3 short sentences. May use inline $...$ math; write LaTeX with DOUBLED backslashes (e.g. \\\\frac, \\\\nabla).',
          },
          misconception: {
            type: ['string', 'null'],
            description:
              'For an INCORRECT choice: a few words naming the specific misconception behind it. Use null for the correct choice.',
          },
        },
        required: ['choiceId', 'message', 'misconception'],
      },
    },
  },
  required: ['hint', 'perChoice'],
};

/** Validates `request.data` into a {@link PrefetchRequestInput}; throws `invalid-argument` if unusable. */
function parsePrefetchInput(data: unknown): PrefetchRequestInput {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Expected a tutor prefetch request object.');
  }

  const raw = data as Record<string, unknown>;

  const prompt = asString(raw.prompt).trim();
  if (!prompt) {
    throw new HttpsError('invalid-argument', 'A non-empty "prompt" is required.');
  }

  if (!Array.isArray(raw.choices) || raw.choices.length === 0) {
    throw new HttpsError('invalid-argument', 'A non-empty "choices" array is required.');
  }
  if (raw.choices.length > MAX_PREFETCH_CHOICES) {
    throw new HttpsError('invalid-argument', `Too many choices (max ${MAX_PREFETCH_CHOICES}).`);
  }

  const choices: PrefetchChoiceInput[] = [];
  for (const entry of raw.choices as unknown[]) {
    if (!entry || typeof entry !== 'object') {
      throw new HttpsError('invalid-argument', 'Each choice must be an object.');
    }
    const choice = entry as Record<string, unknown>;
    const id = asString(choice.id).trim();
    const label = asString(choice.label).trim();
    if (!id) {
      throw new HttpsError('invalid-argument', 'Each choice needs a non-empty "id".');
    }
    choices.push({ id, label });
  }

  const correctChoiceId = asString(raw.correctChoiceId).trim();
  if (!correctChoiceId || !choices.some((choice) => choice.id === correctChoiceId)) {
    throw new HttpsError('invalid-argument', '"correctChoiceId" must match one of the choices.');
  }

  const staticHint = asString(raw.staticHint).trim();
  const staticCorrectExplanation = asString(raw.staticCorrectExplanation).trim();
  const staticIncorrectExplanation = asString(raw.staticIncorrectExplanation).trim();
  const visualHint = asString(raw.visualHint).trim();

  return {
    prompt,
    choices,
    correctChoiceId,
    profileSummary: asString(raw.profileSummary),
    ...(staticHint ? { staticHint } : {}),
    ...(staticCorrectExplanation ? { staticCorrectExplanation } : {}),
    ...(staticIncorrectExplanation ? { staticIncorrectExplanation } : {}),
    ...(visualHint ? { visualHint } : {}),
  };
}

/* Mirrors buildUserPrompt's rules but asks for the whole batch in one shot. */
function buildPrefetchUserPrompt(input: PrefetchRequestInput): string {
  const correct = input.choices.find((choice) => choice.id === input.correctChoiceId);
  const lines: string[] = [
    `Question: ${input.prompt}`,
    `The correct answer is choice id "${input.correctChoiceId}"${
      correct ? `: ${correct.label}` : ''
    }.`,
    'Answer choices:',
    ...input.choices.map(
      (choice) =>
        `- id "${choice.id}": ${choice.label || '(no label)'}${
          choice.id === input.correctChoiceId ? '  (CORRECT)' : '  (incorrect)'
        }`,
    ),
    `Reference hint (do NOT repeat verbatim): ${input.staticHint || '(none provided)'}`,
    `Reference explanation for the correct answer (do NOT repeat verbatim): ${
      input.staticCorrectExplanation || '(none provided)'
    }`,
    `Reference explanation for incorrect answers (do NOT repeat verbatim): ${
      input.staticIncorrectExplanation || '(none provided)'
    }`,
    input.profileSummary
      ? `Learner profile (recent history): ${input.profileSummary}`
      : 'Learner profile: no history yet — keep it general.',
  ];

  if (input.visualHint) {
    lines.push(`On-screen interactive the student can use right now: ${input.visualHint}`);
  }

  lines.push(
    '',
    'Task: Prepare the coaching for this question IN ADVANCE.',
    '1. "hint": Give ONE nudge toward the right approach BEFORE the student answers. If an on-screen interactive is described above, explain CONCRETELY how the student can use it to make progress — name what to drag/adjust and what to watch happen (e.g. "drag the point near $x = \\dots$ and watch how the slope of the tangent changes"). Do NOT reveal the correct answer and do NOT perform the final step for them.',
    '2. "perChoice": Provide one entry for EVERY answer choice above, copying its exact choice id. For the CORRECT choice, give brief, genuine, SPECIFIC praise (1-2 sentences) and set "misconception" to null. For EACH INCORRECT choice, diagnose the SPECIFIC mistake behind THAT particular choice (not a generic restatement of the reference) and gently steer toward the right idea without shaming; set "misconception" to a few words naming that specific misconception. If the learner profile shows a relevant recurring pattern, connect to it briefly.',
    'Return one perChoice entry per choice id and nothing else.',
  );

  return lines.join('\n');
}

/**
 * Parses the batch reply: validates the LaTeX (downgrading non-renderable spans),
 * drops unusable entries, and keeps only those mapping to a real input choice (in
 * order). Returns null when nothing usable remains.
 */
function parsePrefetchResponse(
  rawText: string,
  input: PrefetchRequestInput,
): PrefetchResponse | null {
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

  /* Validate the LaTeX BEFORE the empty-check/trim (same as parseTutorResponse). */
  const hint =
    typeof candidate.hint === 'string' ? sanitizeAiLatex(candidate.hint).trim() : '';

  const rawPerChoice: unknown[] = Array.isArray(candidate.perChoice) ? candidate.perChoice : [];
  const byChoiceId = new Map<string, PrefetchPerChoice>();
  for (const entry of rawPerChoice) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const choice = entry as Record<string, unknown>;
    const choiceId = typeof choice.choiceId === 'string' ? choice.choiceId.trim() : '';
    const message =
      typeof choice.message === 'string' ? sanitizeAiLatex(choice.message).trim() : '';
    if (!choiceId || !message || byChoiceId.has(choiceId)) {
      continue;
    }

    const item: PrefetchPerChoice = { choiceId, message };
    if (typeof choice.misconception === 'string') {
      const misconception = sanitizeAiLatex(choice.misconception).trim();
      if (misconception) {
        item.misconception = misconception;
      }
    }
    byChoiceId.set(choiceId, item);
  }

  // Keep only entries that correspond to a real input choice, in input order.
  const perChoice: PrefetchPerChoice[] = [];
  for (const choice of input.choices) {
    const item = byChoiceId.get(choice.id);
    if (item) {
      perChoice.push(item);
    }
  }

  if (!hint && perChoice.length === 0) {
    return null;
  }

  return { hint, perChoice };
}

/**
 * Callable BATCH tutor proxy. Same auth gate and failure semantics as
 * {@link generateTutorFeedback}, but pre-generates the hint + one message per
 * choice in one call so the client serves them instantly.
 */
export const prefetchTutorFeedback = onCall(
  {
    region: REGION,
    secrets: [OPENAI_API_KEY],
    maxInstances: 10,
    timeoutSeconds: 30,
  },
  async (request: CallableRequest<unknown>): Promise<PrefetchResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to use the AI coach.');
    }

    const input = parsePrefetchInput(request.data);

    try {
      const client = getOpenAiClient();
      const response = await client.responses.create({
        model: TUTOR_MODEL,
        instructions: PREFETCH_SYSTEM_INSTRUCTION,
        input: buildPrefetchUserPrompt(input),
        /* Much larger budget than the one-shot path: a hint + several messages
         * must fit alongside hidden reasoning. */
        max_output_tokens: MAX_PREFETCH_OUTPUT_TOKENS,
        reasoning: { effort: 'low' },
        text: {
          format: {
            type: 'json_schema',
            name: 'tutor_prefetch',
            schema: PREFETCH_JSON_SCHEMA,
            strict: true,
          },
        },
      });

      const parsed = parsePrefetchResponse(response.output_text ?? '', input);
      if (!parsed) {
        throw new HttpsError(
          'failed-precondition',
          `AI returned an empty or unparseable response ${describeIncompleteResponse(response)}.`,
        );
      }
      return parsed;
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('unavailable', describeOpenAiError(error));
    }
  },
);

/*
 * Challenge round (generateChallengeQuestions): from the practice set a learner
 * just finished, designs new MC questions targeting their weak concepts at their
 * level. Same contract as the tutor paths. Output is AI-authored and validated
 * only structurally below, so the client skips the round on any failure.
 */

/* Up to five full questions plus hidden reasoning must fit — far more headroom
 * than the tutor paths — or a truncated reply fails to parse. */
const MAX_CHALLENGE_OUTPUT_TOKENS = 8000;

/* Defensive caps so a malformed request can't blow up cost. A real session is
 * 20 questions asking for 5 new ones. */
const MAX_CHALLENGE_SESSION_QUESTIONS = 40;
const MAX_CHALLENGE_COUNT = 5;
const DEFAULT_CHALLENGE_COUNT = 5;
// Each generated question must offer at least this many choices (3-4 expected).
const MIN_CHALLENGE_CHOICES = 3;

interface ChallengeChoiceInput {
  id: string;
  label: string;
}

/* One answered question + the learner's choice and correctness — raw material for
 * inferring weak concepts. */
interface ChallengeSessionQuestionInput {
  prompt: string;
  choices: ChallengeChoiceInput[];
  correctChoiceId: string;
  userChoiceId: string;
  isCorrect: boolean;
  category?: string;
}

interface ChallengeRequestInput {
  sessionQuestions: ChallengeSessionQuestionInput[];
  profileSummary: string;
  count: number;
}

interface ChallengeQuestionOutput {
  id: string;
  prompt: string;
  choices: ChallengeChoiceInput[];
  correctChoiceId: string;
  explanation: string;
  targetConcept: string;
}

interface ChallengeResponse {
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

/** Validates `request.data` into a {@link ChallengeRequestInput}; throws `invalid-argument` if unusable. */
function parseChallengeInput(data: unknown): ChallengeRequestInput {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Expected a challenge request object.');
  }

  const raw = data as Record<string, unknown>;

  if (!Array.isArray(raw.sessionQuestions) || raw.sessionQuestions.length === 0) {
    throw new HttpsError('invalid-argument', 'A non-empty "sessionQuestions" array is required.');
  }
  if (raw.sessionQuestions.length > MAX_CHALLENGE_SESSION_QUESTIONS) {
    throw new HttpsError(
      'invalid-argument',
      `Too many session questions (max ${MAX_CHALLENGE_SESSION_QUESTIONS}).`,
    );
  }

  const sessionQuestions: ChallengeSessionQuestionInput[] = [];
  for (const entry of raw.sessionQuestions as unknown[]) {
    if (!entry || typeof entry !== 'object') {
      throw new HttpsError('invalid-argument', 'Each session question must be an object.');
    }
    const question = entry as Record<string, unknown>;
    const prompt = asString(question.prompt).trim();
    if (!prompt) {
      throw new HttpsError('invalid-argument', 'Each session question needs a non-empty "prompt".');
    }

    if (!Array.isArray(question.choices) || question.choices.length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'Each session question needs a non-empty "choices" array.',
      );
    }

    const choices: ChallengeChoiceInput[] = [];
    for (const choiceEntry of question.choices as unknown[]) {
      if (!choiceEntry || typeof choiceEntry !== 'object') {
        continue;
      }
      const choice = choiceEntry as Record<string, unknown>;
      const id = asString(choice.id).trim();
      if (id) {
        choices.push({ id, label: asString(choice.label).trim() });
      }
    }
    if (choices.length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'Each session question needs at least one valid choice.',
      );
    }

    const category = asString(question.category).trim();
    sessionQuestions.push({
      prompt,
      choices,
      correctChoiceId: asString(question.correctChoiceId).trim(),
      userChoiceId: asString(question.userChoiceId).trim(),
      isCorrect: question.isCorrect === true,
      ...(category ? { category } : {}),
    });
  }

  const rawCount =
    typeof raw.count === 'number' && Number.isFinite(raw.count)
      ? Math.floor(raw.count)
      : DEFAULT_CHALLENGE_COUNT;
  const count = Math.max(1, Math.min(MAX_CHALLENGE_COUNT, rawCount));

  return {
    sessionQuestions,
    profileSummary: asString(raw.profileSummary),
    count,
  };
}

function buildChallengeUserPrompt(input: ChallengeRequestInput): string {
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
 * Parses and VALIDATES the challenge reply: validates the LaTeX (downgrading
 * non-renderable spans), drops any question failing the structural contract (>=
 * {@link MIN_CHALLENGE_CHOICES} unique choices + a matching `correctChoiceId`), and
 * synthesizes unique ids. Returns null unless >= `count` survive.
 */
function parseChallengeResponse(rawText: string, count: number): ChallengeResponse | null {
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

/**
 * Callable challenge-round generator. Same auth gate and failure semantics as
 * {@link generateTutorFeedback}: returns a validated {@link ChallengeResponse} and
 * throws {@link HttpsError} on failure (or empty/invalid output) so the client
 * skips the round.
 */
export const generateChallengeQuestions = onCall(
  {
    region: REGION,
    secrets: [OPENAI_API_KEY],
    maxInstances: 10,
    timeoutSeconds: 30,
  },
  async (request: CallableRequest<unknown>): Promise<ChallengeResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to use the AI coach.');
    }

    const input = parseChallengeInput(request.data);

    try {
      const client = getOpenAiClient();
      const response = await client.responses.create({
        model: TUTOR_MODEL,
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
        throw new HttpsError(
          'failed-precondition',
          `AI returned an empty or invalid challenge set ${describeIncompleteResponse(response)}.`,
        );
      }
      return parsed;
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('unavailable', describeOpenAiError(error));
    }
  },
);

/*
 * VISION "review my work" hint (generateWorkHintFeedback): a DEDICATED callable —
 * kept separate from the fast text/prefetch tutor paths — that looks at a photo,
 * scan, or whiteboard drawing of the student's handwritten work and tells them
 * whether they are ON THE RIGHT TRACK, without revealing the final answer. Same
 * auth gate, error semantics, and LaTeX cleaning as the other callables.
 */

interface WorkHintRequestInput {
  prompt: string;
  /** Answer-choice labels, for the model's context only. */
  choices: string[];
  /** The correct answer label, for context only — never revealed to the student. */
  correctLabel: string;
  /** Compact history summary from the client (may be empty). */
  profileSummary: string;
  /** The student's work as a base64 image data URL (PNG/JPEG/WebP). */
  workImage: string;
}

interface WorkHintResponse {
  message: string;
  /** true = on track, false = a clear early mistake, omitted = unreadable/unsure. */
  onTrack?: boolean;
}

const WORK_HINT_SYSTEM_INSTRUCTION = [
  'You are SlopeWise Coach, an encouraging and concise calculus tutor inside a learning app.',
  'A student has shared a PHOTO, SCAN, or DRAWING of their own handwritten work on a practice question. Your job is to review THAT work and tell them whether they are on the right track — like a kind tutor glancing over their shoulder.',
  'Style rules:',
  '- Be warm, specific, and brief. Keep "message" to at most 2-3 short sentences.',
  '- FIRST affirm what they did correctly, referencing something concrete you can actually see in their work. THEN point to the FIRST place they go wrong, or the single next step to take if everything so far is right.',
  '- This is a HINT: never reveal, state, or compute the final answer, even though you are given the correct answer for context.',
  '- If the image is blank, unreadable, or unrelated to the question, say so gently and give a generic nudge toward how to begin. Never pretend to see work that is not there, and in that case set "onTrack" to null.',
  "- You may write inline math with single dollar signs, e.g. $f'(x) = 2x$. Never use display math ($$) or code fences.",
  '- CRITICAL: inside JSON string values, write every LaTeX backslash DOUBLED (\\\\frac, \\\\sqrt, \\\\int, \\\\theta), because a single backslash is consumed by JSON escaping and corrupts the command.',
  '- Speak directly to the student ("you").',
  '- Always answer with the requested JSON object and nothing else.',
].join('\n');

/* Strict JSON schema. `onTrack` is nullable+required (strict mode needs every
 * property); the server drops null before returning. */
const WORK_HINT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    message: {
      type: 'string',
      description:
        'The hint shown to the student about their handwritten work. 2-3 short sentences. May use inline $...$ math; write LaTeX with DOUBLED backslashes (e.g. \\\\frac, \\\\int).',
    },
    onTrack: {
      type: ['boolean', 'null'],
      description:
        'true if the work so far is sound, false if there is a clear early mistake, null if the image is unreadable/blank/irrelevant.',
    },
  },
  required: ['message', 'onTrack'],
};

/** Validates `request.data` into a {@link WorkHintRequestInput}; throws `invalid-argument` if unusable. */
function parseWorkHintInput(data: unknown): WorkHintRequestInput {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Expected a work-hint request object.');
  }

  const raw = data as Record<string, unknown>;

  const prompt = asString(raw.prompt).trim();
  if (!prompt) {
    throw new HttpsError('invalid-argument', 'A non-empty "prompt" is required.');
  }

  const workImage = asString(raw.workImage).trim();
  if (!workImage.startsWith('data:image/')) {
    throw new HttpsError('invalid-argument', 'A "workImage" base64 image data URL is required.');
  }
  if (workImage.length > MAX_WORK_IMAGE_DATA_URL_LENGTH) {
    throw new HttpsError('invalid-argument', 'The work image is too large.');
  }

  const choices = Array.isArray(raw.choices)
    ? raw.choices.map((choice) => asString(choice).trim()).filter(Boolean)
    : [];

  return {
    prompt,
    choices,
    correctLabel: asString(raw.correctLabel).trim(),
    profileSummary: asString(raw.profileSummary),
    workImage,
  };
}

function buildWorkHintUserPrompt(input: WorkHintRequestInput): string {
  const lines: string[] = [
    `Question: ${input.prompt}`,
    `Answer choices: ${input.choices.length > 0 ? input.choices.join(' | ') : '(not provided)'}`,
    `The correct answer (for YOUR context only — do NOT reveal it): ${input.correctLabel || '(not provided)'}`,
    input.profileSummary
      ? `Learner profile (recent history): ${input.profileSummary}`
      : 'Learner profile: no history yet — keep it general.',
    '',
    'The student has attached an image of their handwritten work below. Task: Look at their work and tell them whether they are ON THE RIGHT TRACK. In "message", first affirm specifically what they have done correctly, then point to the FIRST place they go wrong (if any) or the single next step to take — as a HINT only. Do NOT reveal or compute the final answer. If the image is blank, unreadable, or unrelated to this question, say so kindly and give a gentle generic nudge. Set "onTrack" to true if their approach so far is sound, false if there is a clear early mistake, and null if you cannot read the work.',
  ];

  return lines.join('\n');
}

function parseWorkHintResponse(rawText: string): WorkHintResponse | null {
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
  const message =
    typeof candidate.message === 'string' ? sanitizeAiLatex(candidate.message).trim() : '';
  if (!message) {
    return null;
  }

  const response: WorkHintResponse = { message };
  if (typeof candidate.onTrack === 'boolean') {
    response.onTrack = candidate.onTrack;
  }

  return response;
}

/**
 * Callable VISION proxy for the "review my work" hint. Requires a signed-in user
 * (auth protects the paid key). Returns a {@link WorkHintResponse}; throws
 * {@link HttpsError} on auth/validation/provider failures. A longer 60s timeout
 * gives the vision model headroom (the client backstops well under that).
 */
export const generateWorkHintFeedback = onCall(
  {
    region: REGION,
    secrets: [OPENAI_API_KEY],
    maxInstances: 10,
    timeoutSeconds: 60,
  },
  async (request: CallableRequest<unknown>): Promise<WorkHintResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to use the AI coach.');
    }

    const input = parseWorkHintInput(request.data);

    try {
      const client = getOpenAiClient();
      const response = await client.responses.create({
        model: WORK_HINT_MODEL,
        instructions: WORK_HINT_SYSTEM_INSTRUCTION,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: buildWorkHintUserPrompt(input) },
              { type: 'input_image', detail: 'auto', image_url: input.workImage },
            ],
          },
        ],
        max_output_tokens: MAX_WORK_HINT_OUTPUT_TOKENS,
        reasoning: { effort: 'low' },
        text: {
          format: {
            type: 'json_schema',
            name: 'work_hint_response',
            schema: WORK_HINT_JSON_SCHEMA,
            strict: true,
          },
        },
      });

      const parsed = parseWorkHintResponse(response.output_text ?? '');
      if (!parsed) {
        throw new HttpsError(
          'failed-precondition',
          `AI returned an empty or unparseable response ${describeIncompleteResponse(response)}.`,
        );
      }
      return parsed;
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('unavailable', describeOpenAiError(error));
    }
  },
);
