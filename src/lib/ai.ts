import { getFunctions, httpsCallable, type HttpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase';

/*
 * AI tutor service (OpenAI via a Firebase Cloud Function proxy). The paid key
 * lives ONLY in the function; this module forwards tutor input and validates the
 * reply. The server returns clean, render-ready LaTeX, so the client only does
 * minimal shape validation (type + trim, plus the challenge structural re-check).
 *
 * STRICTLY OPTIONAL and ADDITIVE: every entry point returns `null` (never throws)
 * on any failure so callers fall back to static text.
 */

export type TutorMode = 'hint' | 'feedback-incorrect' | 'encourage-correct';

export type TutorRequestInput = {
  mode: TutorMode;
  prompt: string;
  chosenLabel: string;
  correctLabel: string;
  isCorrect: boolean;
  /** The existing static explanation/hint — context the model should improve on. */
  staticExplanation: string;
  /** Compact history summary from buildLearnerProfileSummary (may be empty). */
  profileSummary: string;
  /**
   * For HINTS on lesson steps with an on-screen interactive: a short description
   * (widget name + label) so the coach can explain HOW to use it. Omitted when none.
   */
  visualHint?: string;
};

export type TutorResponse = {
  message: string;
  misconception?: string;
};

/* Batch prefetch shapes (prefetchTutorResponses): one call pre-generates the hint
 * AND a message per choice. */

export type PrefetchTutorInput = {
  prompt: string;
  /** Every answer choice for the question (id + label). */
  choices: { id: string; label: string }[];
  /** Id of the correct choice (must match one of `choices`). */
  correctChoiceId: string;
  /** Existing static hint, sent to the model as reference (optional). */
  staticHint?: string;
  /** Static explanation shown for the correct answer (optional). */
  staticCorrectExplanation?: string;
  /** Static explanation shown for a wrong answer (optional). */
  staticIncorrectExplanation?: string;
  /** Compact history summary from buildLearnerProfileSummary (may be empty). */
  profileSummary: string;
  /** Description of an on-screen interactive, used for the HINT only (optional). */
  visualHint?: string;
};

export type PrefetchPerChoiceResponse = {
  choiceId: string;
  message: string;
  misconception?: string;
};

export type PrefetchTutorResponse = {
  /** Pre-generated hint (empty string when the model omitted a usable one). */
  hint: string;
  /** One entry per usable choice, keyed by the input choiceId. */
  perChoice: PrefetchPerChoiceResponse[];
};

/* Challenge round shapes (generateChallengeQuestions): the client sends the
 * answered questions + the learner's answers; the callable returns new MC
 * questions targeting weak concepts. */

/** One answered bank question, with the learner's pick + correctness. */
export type ChallengeSessionQuestion = {
  prompt: string;
  choices: { id: string; label: string }[];
  correctChoiceId: string;
  /** The id of the choice the learner picked. */
  userChoiceId: string;
  isCorrect: boolean;
  /** Optional finer-grained topic label, forwarded to help the model. */
  category?: string;
};

export type ChallengeRequestInput = {
  /** The questions the learner just answered (the 12 bank questions + answers). */
  sessionQuestions: ChallengeSessionQuestion[];
  /** Compact history summary from buildLearnerProfileSummary (optional). */
  profileSummary?: string;
  /** How many new questions to generate (5 for the challenge round). */
  count: number;
};

/** An AI-generated challenge question: a PracticeQuestion's shape plus the weak
 * area it targets. */
export type ChallengeQuestion = {
  id: string;
  prompt: string;
  choices: { id: string; label: string }[];
  correctChoiceId: string;
  explanation: string;
  /** Short phrase naming the weak area this question targets. */
  targetConcept: string;
};

export type ChallengeQuestionsResponse = {
  questions: ChallengeQuestion[];
};

/* "Review my work" VISION hint shapes (generateWorkHint): the client sends the
 * question context + a base64 image of the student's handwritten work; the
 * callable returns an encouraging "on the right track?" hint. */

export type WorkHintInput = {
  /** The question the student is working on. */
  prompt: string;
  /** Answer-choice labels, for the model's context only. */
  choices: string[];
  /** The correct answer label, for context only — never revealed to the student. */
  correctLabel: string;
  /** Compact history summary from buildLearnerProfileSummary (optional). */
  profileSummary?: string;
  /**
   * The student's work as base64 image data URLs (PNG/JPEG/WebP) — one per
   * uploaded page. A whiteboard drawing is sent as a single-element array.
   */
  workImages: string[];
};

export type WorkHintResponse = {
  message: string;
  /** true = on track, false = a clear early mistake, omitted = unreadable/unsure. */
  onTrack?: boolean;
};

/** Result of the lightweight {@link checkAiAvailability} probe. */
export type AiAvailability = {
  available: boolean;
  /**
   * Present only when `available` is false:
   * 'offline' | 'signed-out' | 'disabled' | 'over-quota' | 'unavailable'.
   */
  reason?: string;
};

/* Region the callable is deployed to (see REGION in functions/src/index.ts). */
const FUNCTIONS_REGION = 'us-central1';
// Name of the deployed 2nd-gen callable.
const TUTOR_CALLABLE_NAME = 'generateTutorFeedback';
// Name of the deployed 2nd-gen BATCH callable (hint + per-choice messages).
const PREFETCH_TUTOR_CALLABLE_NAME = 'prefetchTutorFeedback';
// Name of the deployed 2nd-gen challenge-round callable.
const CHALLENGE_CALLABLE_NAME = 'generateChallengeQuestions';
// Name of the deployed 2nd-gen VISION "review my work" callable.
const WORK_HINT_CALLABLE_NAME = 'generateWorkHintFeedback';
// Name of the deployed 2nd-gen AI-availability probe callable.
const AVAILABILITY_CALLABLE_NAME = 'checkAiAvailability';

/* Min choices per challenge question; mirrors the server's MIN_CHALLENGE_CHOICES. */
const MIN_CHALLENGE_CHOICES = 3;

/* Defensive client cap on how many work images we forward (mirrors the server's
 * MAX_WORK_IMAGES); the UI enforces the same number with a clear message. */
const MAX_WORK_HINT_IMAGES = 8;

/* The callable SDK enforces REQUEST_TIMEOUT_MS; a slightly longer local backstop
 * guarantees the UI is never blocked if that timer misfires. */
const REQUEST_TIMEOUT_MS = 8000;
const HARD_TIMEOUT_MS = REQUEST_TIMEOUT_MS + 2000;

/* The challenge round generates several questions per call, much slower than the
 * tutor paths, and runs behind a "Generating…" state — so it gets a far longer
 * client timeout (still under the function's 30s ceiling). */
const CHALLENGE_REQUEST_TIMEOUT_MS = 25000;
const CHALLENGE_HARD_TIMEOUT_MS = CHALLENGE_REQUEST_TIMEOUT_MS + 2000;

/* The work-hint call sends an image to a slower vision model, so — like the
 * challenge round — it gets a far longer timeout than the 8s text path (still well
 * under the function's 60s ceiling). It's an explicit on-demand action behind its
 * own loader, never the prefetched hot path. */
const WORK_HINT_REQUEST_TIMEOUT_MS = 25000;
const WORK_HINT_HARD_TIMEOUT_MS = WORK_HINT_REQUEST_TIMEOUT_MS + 2000;

/* The availability probe is a tiny request behind a "Checking…" state, so it gets
 * a short timeout. An "available" result is cached briefly to avoid re-probing on
 * every pop-up open (failures are never cached, so Retry always re-checks). */
const AVAILABILITY_REQUEST_TIMEOUT_MS = 12000;
const AVAILABILITY_HARD_TIMEOUT_MS = AVAILABILITY_REQUEST_TIMEOUT_MS + 2000;
const AVAILABILITY_CACHE_MS = 60000;

function readAiFlag(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

/* Mirror firebase.ts: AI is OFF in tests unless services are explicitly enabled,
 * so tests exercise the static fallback and never hit the network. */
const isAiDisabledForTests =
  import.meta.env.MODE === 'test' && import.meta.env.VITE_FIREBASE_ENABLE_TEST_SERVICES !== 'true';

const aiTutorEnabled =
  readAiFlag(import.meta.env.VITE_ENABLE_AI_TUTOR) && Boolean(firebaseApp) && !isAiDisabledForTests;

/** Whether the AI tutor is configured and allowed to run in this environment. */
export function isAiTutorEnabled(): boolean {
  return aiTutorEnabled;
}

/** True unless the browser explicitly reports it is offline. */
function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** The callable's wire shape. Validated again in {@link coerceTutorResponse}. */
type TutorCallable = HttpsCallable<TutorRequestInput, TutorResponse>;

/* Lazily built + memoized. `undefined` = not built yet, `null` = can't build
 * (disabled / init failed). Never throws. */
let cachedCallable: TutorCallable | null | undefined;

function getTutorCallable(onErrorDetail?: (detail: string) => void): TutorCallable | null {
  if (cachedCallable !== undefined) {
    return cachedCallable;
  }

  if (!aiTutorEnabled || !firebaseApp) {
    cachedCallable = null;
    onErrorDetail?.("AI tutor disabled (VITE_ENABLE_AI_TUTOR not 'true')");
    return cachedCallable;
  }

  try {
    const functions = getFunctions(firebaseApp, FUNCTIONS_REGION);
    cachedCallable = httpsCallable<TutorRequestInput, TutorResponse>(
      functions,
      TUTOR_CALLABLE_NAME,
      { timeout: REQUEST_TIMEOUT_MS },
    );
  } catch (error) {
    cachedCallable = null;
    onErrorDetail?.(`Tutor callable init failed: ${describeError(error)}`);
  }

  return cachedCallable;
}

/** The batch callable's wire shape. Validated again in {@link coercePrefetchResponse}. */
type PrefetchCallable = HttpsCallable<PrefetchTutorInput, PrefetchTutorResponse>;

// Separate memoization from the one-shot callable (same lazy/never-throw rules).
let cachedPrefetchCallable: PrefetchCallable | null | undefined;

function getPrefetchCallable(
  onErrorDetail?: (detail: string) => void,
): PrefetchCallable | null {
  if (cachedPrefetchCallable !== undefined) {
    return cachedPrefetchCallable;
  }

  if (!aiTutorEnabled || !firebaseApp) {
    cachedPrefetchCallable = null;
    onErrorDetail?.("AI tutor disabled (VITE_ENABLE_AI_TUTOR not 'true')");
    return cachedPrefetchCallable;
  }

  try {
    const functions = getFunctions(firebaseApp, FUNCTIONS_REGION);
    cachedPrefetchCallable = httpsCallable<PrefetchTutorInput, PrefetchTutorResponse>(
      functions,
      PREFETCH_TUTOR_CALLABLE_NAME,
      { timeout: REQUEST_TIMEOUT_MS },
    );
  } catch (error) {
    cachedPrefetchCallable = null;
    onErrorDetail?.(`Tutor callable init failed: ${describeError(error)}`);
  }

  return cachedPrefetchCallable;
}

/** The challenge callable's wire shape. Validated again in {@link coerceChallengeQuestions}. */
type ChallengeCallable = HttpsCallable<ChallengeRequestInput, ChallengeQuestionsResponse>;

// Separate memoization from the tutor callables (same lazy/never-throw rules).
let cachedChallengeCallable: ChallengeCallable | null | undefined;

function getChallengeCallable(
  onErrorDetail?: (detail: string) => void,
): ChallengeCallable | null {
  if (cachedChallengeCallable !== undefined) {
    return cachedChallengeCallable;
  }

  if (!aiTutorEnabled || !firebaseApp) {
    cachedChallengeCallable = null;
    onErrorDetail?.("AI tutor disabled (VITE_ENABLE_AI_TUTOR not 'true')");
    return cachedChallengeCallable;
  }

  try {
    const functions = getFunctions(firebaseApp, FUNCTIONS_REGION);
    cachedChallengeCallable = httpsCallable<ChallengeRequestInput, ChallengeQuestionsResponse>(
      functions,
      CHALLENGE_CALLABLE_NAME,
      { timeout: CHALLENGE_REQUEST_TIMEOUT_MS },
    );
  } catch (error) {
    cachedChallengeCallable = null;
    onErrorDetail?.(`Challenge callable init failed: ${describeError(error)}`);
  }

  return cachedChallengeCallable;
}

/** The work-hint callable's wire shape. Validated again in {@link coerceWorkHintResponse}. */
type WorkHintCallable = HttpsCallable<WorkHintInput, WorkHintResponse>;

// Separate memoization from the other callables (same lazy/never-throw rules).
let cachedWorkHintCallable: WorkHintCallable | null | undefined;

function getWorkHintCallable(
  onErrorDetail?: (detail: string) => void,
): WorkHintCallable | null {
  if (cachedWorkHintCallable !== undefined) {
    return cachedWorkHintCallable;
  }

  if (!aiTutorEnabled || !firebaseApp) {
    cachedWorkHintCallable = null;
    onErrorDetail?.("AI tutor disabled (VITE_ENABLE_AI_TUTOR not 'true')");
    return cachedWorkHintCallable;
  }

  try {
    const functions = getFunctions(firebaseApp, FUNCTIONS_REGION);
    cachedWorkHintCallable = httpsCallable<WorkHintInput, WorkHintResponse>(
      functions,
      WORK_HINT_CALLABLE_NAME,
      { timeout: WORK_HINT_REQUEST_TIMEOUT_MS },
    );
  } catch (error) {
    cachedWorkHintCallable = null;
    onErrorDetail?.(`Work-hint callable init failed: ${describeError(error)}`);
  }

  return cachedWorkHintCallable;
}

/**
 * Validates the callable's payload: `message` required, `onTrack` kept only when a
 * boolean. Returns `null` for anything unusable (→ static fallback).
 */
function coerceTutorResponse(data: unknown): TutorResponse | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const candidate = data as Partial<Record<keyof TutorResponse, unknown>>;
  // Trust the structured, server-validated payload — just type-check and trim.
  const message =
    typeof candidate.message === 'string' ? candidate.message.trim() : '';

  if (!message) {
    return null;
  }

  const response: TutorResponse = { message };

  if (typeof candidate.misconception === 'string') {
    const misconception = candidate.misconception.trim();
    if (misconception) {
      response.misconception = misconception;
    }
  }

  return response;
}

/**
 * Validates the batch payload (type-checks + trims), drops entries missing a
 * choiceId or message, and returns `null` only when NOTHING usable remains. A hint
 * with no choices (or vice versa) is still returned.
 */
function coercePrefetchResponse(data: unknown): PrefetchTutorResponse | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const candidate = data as Record<string, unknown>;
  const hint = typeof candidate.hint === 'string' ? candidate.hint.trim() : '';

  const rawPerChoice: unknown[] = Array.isArray(candidate.perChoice) ? candidate.perChoice : [];
  const perChoice: PrefetchPerChoiceResponse[] = [];
  for (const entry of rawPerChoice) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const choice = entry as Record<string, unknown>;
    const choiceId = typeof choice.choiceId === 'string' ? choice.choiceId.trim() : '';
    const message = typeof choice.message === 'string' ? choice.message.trim() : '';
    if (!choiceId || !message) {
      continue;
    }

    const item: PrefetchPerChoiceResponse = { choiceId, message };
    if (typeof choice.misconception === 'string') {
      const misconception = choice.misconception.trim();
      if (misconception) {
        item.misconception = misconception;
      }
    }
    perChoice.push(item);
  }

  if (!hint && perChoice.length === 0) {
    return null;
  }

  return { hint, perChoice };
}

/**
 * Validates the challenge payload. Re-checks each question's STRUCTURE defensively
 * (unvalidated AI content): keeps only those with a prompt, >=
 * {@link MIN_CHALLENGE_CHOICES} labeled choices, and a matching `correctChoiceId`,
 * synthesizing unique ids. Returns `null` unless >= `count` survive (→ skip round).
 */
function coerceChallengeQuestions(
  data: unknown,
  count: number,
): ChallengeQuestionsResponse | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const candidate = data as Record<string, unknown>;
  const rawQuestions: unknown[] = Array.isArray(candidate.questions) ? candidate.questions : [];

  const questions: ChallengeQuestion[] = [];
  const usedIds = new Set<string>();

  for (const entry of rawQuestions) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const question = entry as Record<string, unknown>;

    const prompt = typeof question.prompt === 'string' ? question.prompt.trim() : '';

    const rawChoices: unknown[] = Array.isArray(question.choices) ? question.choices : [];
    const choices: { id: string; label: string }[] = [];
    const seenChoiceIds = new Set<string>();
    for (const choiceEntry of rawChoices) {
      if (!choiceEntry || typeof choiceEntry !== 'object') {
        continue;
      }
      const choice = choiceEntry as Record<string, unknown>;
      const id = typeof choice.id === 'string' ? choice.id.trim() : '';
      const label = typeof choice.label === 'string' ? choice.label.trim() : '';
      if (!id || !label || seenChoiceIds.has(id)) {
        continue;
      }
      seenChoiceIds.add(id);
      choices.push({ id, label });
    }

    const correctChoiceId =
      typeof question.correctChoiceId === 'string' ? question.correctChoiceId.trim() : '';

    if (
      !prompt ||
      choices.length < MIN_CHALLENGE_CHOICES ||
      !choices.some((choice) => choice.id === correctChoiceId)
    ) {
      continue;
    }

    const explanation =
      typeof question.explanation === 'string' ? question.explanation.trim() : '';
    const targetConcept =
      typeof question.targetConcept === 'string' ? question.targetConcept.trim() : '';

    let id = typeof question.id === 'string' ? question.id.trim() : '';
    if (!id || usedIds.has(id)) {
      id = `challenge-${questions.length + 1}`;
    }
    while (usedIds.has(id)) {
      id = `${id}-x`;
    }
    usedIds.add(id);

    questions.push({ id, prompt, choices, correctChoiceId, explanation, targetConcept });
  }

  if (questions.length < count) {
    return null;
  }

  return { questions: questions.slice(0, count) };
}

/**
 * Validates the work-hint payload: `message` required, `onTrack` kept only when a
 * boolean. Returns `null` for anything unusable (→ caller's text/static fallback).
 */
function coerceWorkHintResponse(data: unknown): WorkHintResponse | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const candidate = data as Partial<Record<keyof WorkHintResponse, unknown>>;
  const message = typeof candidate.message === 'string' ? candidate.message.trim() : '';
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
 * Marks a tutor request that exceeded {@link HARD_TIMEOUT_MS} so timeouts report
 * distinctly ("Timed out after Ns") rather than as a generic error.
 */
class TutorTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`AI tutor request timed out after ${timeoutMs}ms`);
    this.name = 'TutorTimeoutError';
  }
}

/* Races a promise against a timeout so a hung call never blocks the UI (the
 * request is abandoned on timeout). Backstop atop the callable SDK's own timeout. */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TutorTimeoutError(timeoutMs)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Builds a concise failure reason from a caught error: the local timeout backstop,
 * the SDK's `functions/deadline-exceeded`, or Firebase callable errors (code +
 * server message). Dev-only diagnostic; callers still fall back to static text.
 */
function describeError(error: unknown): string {
  if (error instanceof TutorTimeoutError) {
    return `Timed out after ${Math.round(error.timeoutMs / 1000)}s`;
  }

  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    const codeStr = typeof code === 'string' ? code : typeof code === 'number' ? String(code) : '';

    /* The SDK maps its timeout option to this code; surface it as a clean timeout. */
    if (codeStr === 'functions/deadline-exceeded') {
      return `Timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s`;
    }

    const message = error.message.trim() || error.name || 'Unknown error';
    return codeStr ? `${message} — ${codeStr}` : message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }

  return 'Unknown error';
}

/**
 * Generates a tailored tutor reply for one answer (or a hint). Returns `null` —
 * never throws — on any failure (disabled, offline, not signed in, timeout,
 * unusable response); callers MUST treat `null` as "show static text". The
 * optional `onErrorDetail` gets a concise dev-only reason whenever it's `null`.
 */
export async function generateTutorResponse(
  input: TutorRequestInput,
  onErrorDetail?: (detail: string) => void,
): Promise<TutorResponse | null> {
  let reported = false;
  const report = (detail: string): null => {
    reported = true;
    onErrorDetail?.(detail);
    return null;
  };

  if (!aiTutorEnabled) {
    return report("AI tutor disabled (VITE_ENABLE_AI_TUTOR not 'true')");
  }
  if (!isOnline()) {
    return report('Device is offline');
  }

  const callable = getTutorCallable(report);
  if (!callable) {
    return reported ? null : report('AI tutor could not be initialized');
  }

  try {
    const result = await withTimeout(callable(input), HARD_TIMEOUT_MS);
    const parsed = coerceTutorResponse(result.data);
    return parsed ?? report('AI returned an empty or unparseable response');
  } catch (error) {
    return report(describeError(error));
  }
}

/**
 * Pre-generates ALL of one question's coaching in a SINGLE call (hint + a message
 * per choice). Returns `null` — never throws — on the same conditions as
 * {@link generateTutorResponse}; callers cache the batch or fall back to static
 * text. The optional `onErrorDetail` gets a concise dev-only reason when `null`.
 */
export async function prefetchTutorResponses(
  input: PrefetchTutorInput,
  onErrorDetail?: (detail: string) => void,
): Promise<PrefetchTutorResponse | null> {
  let reported = false;
  const report = (detail: string): null => {
    reported = true;
    onErrorDetail?.(detail);
    return null;
  };

  if (!aiTutorEnabled) {
    return report("AI tutor disabled (VITE_ENABLE_AI_TUTOR not 'true')");
  }
  if (!isOnline()) {
    return report('Device is offline');
  }

  const callable = getPrefetchCallable(report);
  if (!callable) {
    return reported ? null : report('AI tutor could not be initialized');
  }

  try {
    const result = await withTimeout(callable(input), HARD_TIMEOUT_MS);
    const parsed = coercePrefetchResponse(result.data);
    return parsed ?? report('AI returned an empty or unparseable response');
  } catch (error) {
    return report(describeError(error));
  }
}

/**
 * Generates a short "challenge round" of new MC questions tailored to how the
 * learner just did. Returns `null` — never throws — on the same conditions as
 * {@link generateTutorResponse} plus over-quota (HTTP 429); callers SKIP the round.
 * The optional `onErrorDetail` gets a concise dev-only reason when `null`.
 */
export async function generateChallengeQuestions(
  input: ChallengeRequestInput,
  onErrorDetail?: (detail: string) => void,
  options?: { timeoutMs?: number },
): Promise<ChallengeQuestionsResponse | null> {
  let reported = false;
  const report = (detail: string): null => {
    reported = true;
    onErrorDetail?.(detail);
    return null;
  };

  if (!aiTutorEnabled) {
    return report("AI tutor disabled (VITE_ENABLE_AI_TUTOR not 'true')");
  }
  if (!isOnline()) {
    return report('Device is offline');
  }

  const callable = getChallengeCallable(report);
  if (!callable) {
    return reported ? null : report('AI tutor could not be initialized');
  }

  try {
    /* The caller may pass a SHORTER timeout (e.g. the practice "fast first
     * question" path). The SDK timeout stays at its default; this backstop just
     * stops the UI waiting past `timeoutMs`. */
    const result = await withTimeout(
      callable(input),
      options?.timeoutMs ?? CHALLENGE_HARD_TIMEOUT_MS,
    );
    const parsed = coerceChallengeQuestions(result.data, input.count);
    return parsed ?? report('AI returned an empty or invalid challenge set');
  } catch (error) {
    return report(describeError(error));
  }
}

/**
 * Asks the VISION model whether the student's handwritten work (an uploaded
 * picture/PDF page or a whiteboard drawing, passed as a base64 image data URL) is
 * ON THE RIGHT TRACK. Returns `null` — never throws — on the same conditions as
 * {@link generateTutorResponse} (disabled/offline/not-signed-in/timeout/parse
 * failure), so callers fall back to the existing text hint / static note. The
 * optional `onErrorDetail` gets a concise dev-only reason when `null`.
 */
export async function generateWorkHint(
  input: WorkHintInput,
  onErrorDetail?: (detail: string) => void,
): Promise<WorkHintResponse | null> {
  let reported = false;
  const report = (detail: string): null => {
    reported = true;
    onErrorDetail?.(detail);
    return null;
  };

  if (!aiTutorEnabled) {
    return report("AI tutor disabled (VITE_ENABLE_AI_TUTOR not 'true')");
  }
  if (!isOnline()) {
    return report('Device is offline');
  }

  const workImages = (Array.isArray(input.workImages) ? input.workImages : [])
    .filter((image) => typeof image === 'string' && image.startsWith('data:image/'))
    .slice(0, MAX_WORK_HINT_IMAGES);
  if (workImages.length === 0) {
    return report('No usable work image to review');
  }

  const callable = getWorkHintCallable(report);
  if (!callable) {
    return reported ? null : report('AI tutor could not be initialized');
  }

  try {
    const result = await withTimeout(
      callable({ ...input, workImages }),
      WORK_HINT_HARD_TIMEOUT_MS,
    );
    const parsed = coerceWorkHintResponse(result.data);
    return parsed ?? report('AI returned an empty or unparseable response');
  } catch (error) {
    return report(describeError(error));
  }
}

/** The availability-probe callable's wire shape (no meaningful input). */
type AvailabilityCallable = HttpsCallable<Record<string, never>, AiAvailability>;

// Separate memoization from the other callables (same lazy/never-throw rules).
let cachedAvailabilityCallable: AvailabilityCallable | null | undefined;

/* A brief cache of the LAST KNOWN-AVAILABLE probe, so reopening the pop-up within
 * the window doesn't re-hit the API. Only `available: true` is cached; any failure
 * clears it, so Retry / the next open always re-probes. */
let availabilityCache: { value: AiAvailability; expires: number } | null = null;

function getAvailabilityCallable(
  onErrorDetail?: (detail: string) => void,
): AvailabilityCallable | null {
  if (cachedAvailabilityCallable !== undefined) {
    return cachedAvailabilityCallable;
  }

  if (!aiTutorEnabled || !firebaseApp) {
    cachedAvailabilityCallable = null;
    onErrorDetail?.("AI tutor disabled (VITE_ENABLE_AI_TUTOR not 'true')");
    return cachedAvailabilityCallable;
  }

  try {
    const functions = getFunctions(firebaseApp, FUNCTIONS_REGION);
    cachedAvailabilityCallable = httpsCallable<Record<string, never>, AiAvailability>(
      functions,
      AVAILABILITY_CALLABLE_NAME,
      { timeout: AVAILABILITY_REQUEST_TIMEOUT_MS },
    );
  } catch (error) {
    cachedAvailabilityCallable = null;
    onErrorDetail?.(`Availability callable init failed: ${describeError(error)}`);
  }

  return cachedAvailabilityCallable;
}

/** Normalizes the probe payload into a definite {@link AiAvailability}. */
function coerceAvailability(data: unknown): AiAvailability {
  if (!data || typeof data !== 'object') {
    return { available: false, reason: 'unavailable' };
  }
  const candidate = data as Record<string, unknown>;
  if (candidate.available === true) {
    return { available: true };
  }
  const reason =
    typeof candidate.reason === 'string' && candidate.reason.trim()
      ? candidate.reason.trim()
      : 'unavailable';
  return { available: false, reason };
}

/**
 * Lightweight probe of whether the AI coach can answer RIGHT NOW. Runs the instant
 * client guards first (disabled/offline), then a tiny backend call that can detect
 * an OUT-OF-QUOTA (429) or server error — the only way to know quota. ALWAYS
 * resolves to an {@link AiAvailability} (never throws). An "available" result is
 * cached for ~60s; failures are never cached so Retry re-checks. The optional
 * `onErrorDetail` gets a concise dev-only reason on failure.
 */
export async function checkAiAvailability(
  onErrorDetail?: (detail: string) => void,
): Promise<AiAvailability> {
  if (!aiTutorEnabled) {
    return { available: false, reason: 'disabled' };
  }
  if (!isOnline()) {
    return { available: false, reason: 'offline' };
  }

  if (availabilityCache && availabilityCache.value.available && availabilityCache.expires > Date.now()) {
    return availabilityCache.value;
  }

  const callable = getAvailabilityCallable(onErrorDetail);
  if (!callable) {
    return { available: false, reason: 'unavailable' };
  }

  try {
    const result = await withTimeout(callable({}), AVAILABILITY_HARD_TIMEOUT_MS);
    const status = coerceAvailability(result.data);
    availabilityCache = status.available
      ? { value: status, expires: Date.now() + AVAILABILITY_CACHE_MS }
      : null;
    return status;
  } catch (error) {
    availabilityCache = null;
    const detail = describeError(error);
    onErrorDetail?.(detail);
    const code = (error as { code?: unknown }).code;
    const codeStr = typeof code === 'string' ? code : '';
    if (codeStr.includes('unauthenticated')) {
      return { available: false, reason: 'signed-out' };
    }
    if (codeStr.includes('resource-exhausted') || /\b429\b|quota/i.test(detail)) {
      return { available: false, reason: 'over-quota' };
    }
    return { available: false, reason: 'unavailable' };
  }
}
