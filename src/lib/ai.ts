import { getFunctions, httpsCallable, type HttpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase';
import { normalizeAiMath } from './normalizeAiMath';

// ---------------------------------------------------------------------------
// AI tutor service (OpenAI via a Firebase Cloud Function proxy).
//
// The paid OpenAI key lives ONLY in the `generateTutorFeedback` Cloud Function
// (see functions/src/index.ts); the browser never sees it. This module just
// forwards the same structured tutor input to that callable and normalizes the
// reply.
//
// This layer is STRICTLY OPTIONAL and ADDITIVE. Callers always have a static
// response to fall back on; every entry point here returns `null` (never throws)
// when the tutor is disabled, the device is offline, the user is not signed in,
// or anything goes wrong, so the UI can keep showing its existing static text.
// ---------------------------------------------------------------------------

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
   * For HINTS on lesson steps that have an on-screen interactive: a short
   * description of that interactive (a friendly widget name + its label) so the
   * coach can explain HOW to use it to make progress. Omitted when the step has
   * no visual (all practice questions and many lesson questions).
   */
  visualHint?: string;
};

export type TutorResponse = {
  message: string;
  misconception?: string;
};

// --- Batch prefetch shapes (prefetchTutorResponses) ------------------------
// One call per question pre-generates the hint AND a message for every choice.

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

// --- Challenge round shapes (generateChallengeQuestions) -------------------
// After a practice session the client sends the answered bank questions PLUS the
// learner's chosen answers/correctness, and the callable returns brand-new MC
// questions tailored to the concepts the learner struggled with.

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

/** A single AI-generated challenge question. Mirrors a PracticeQuestion's shape
 * (minus the bank-only fields) plus the weak area it targets. */
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

// Region the callable is deployed to (see REGION in functions/src/index.ts).
// Kept as a constant so it is swappable in one place if the function moves.
const FUNCTIONS_REGION = 'us-central1';
// Name of the deployed 2nd-gen callable.
const TUTOR_CALLABLE_NAME = 'generateTutorFeedback';
// Name of the deployed 2nd-gen BATCH callable (hint + per-choice messages).
const PREFETCH_TUTOR_CALLABLE_NAME = 'prefetchTutorFeedback';
// Name of the deployed 2nd-gen challenge-round callable.
const CHALLENGE_CALLABLE_NAME = 'generateChallengeQuestions';

// Each generated challenge question must offer at least this many choices; mirror
// of the server-side MIN_CHALLENGE_CHOICES so the client re-validates defensively.
const MIN_CHALLENGE_CHOICES = 3;

// Budget knobs. The callable SDK enforces this timeout for us (cancelling the
// request and rejecting with `functions/deadline-exceeded`); a slightly longer
// local backstop guarantees the UI is never blocked even if that timer misfires.
const REQUEST_TIMEOUT_MS = 8000;
const HARD_TIMEOUT_MS = REQUEST_TIMEOUT_MS + 2000;

// The challenge round generates THREE full questions in one call, which takes
// meaningfully longer than the ~2s tutor paths. It runs once at the end of a
// session behind an explicit "Generating…" state (not in the answer hot path),
// so it gets a far longer client timeout — still comfortably under the Cloud
// Function's 30s ceiling. Same withTimeout/offline/null-on-failure contract.
const CHALLENGE_REQUEST_TIMEOUT_MS = 25000;
const CHALLENGE_HARD_TIMEOUT_MS = CHALLENGE_REQUEST_TIMEOUT_MS + 2000;

function readAiFlag(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

// Mirror the firebase.ts test-disable pattern: AI is OFF in the test runner unless
// services are explicitly enabled, so component tests always exercise the static
// fallback path and never reach out to the network.
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

// Lazily built once and memoized. `undefined` = not built yet, `null` = building
// is not possible (disabled or init failed). Never throws to callers.
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

// Maps the control chars OpenAI leaves behind back to their original LaTeX
// backslash sequences. See repairLatexEscapes for the full explanation.
const LATEX_ESCAPE_REPAIRS: Record<string, string> = {
  '\u0000': '\\', // invalid escape (\i, \l, \s, \c, ...) -> NUL + command letters
  '\u0007': '\\a', // \a (\alpha, \approx, \arctan, \angle, ...)
  '\u0008': '\\b', // \b (\beta, ...)
  '\u0009': '\\t', // \t (\to, \times, \theta, ...)
  '\u000b': '\\v', // \v (\vec, \varphi, \varepsilon, ...)
  '\u000c': '\\f', // \f (\frac, ...)
  '\u000d': '\\r', // \r (\rho, \rightarrow, ...)
};

/**
 * Repairs LaTeX mangled by OpenAI structured outputs. The model's JSON string
 * intermittently mis-escapes the backslashes of LaTeX commands, so once the JSON
 * is parsed those backslashes have already collapsed into control characters.
 * Every single-letter C-style escape can appear, so we map them ALL back:
 *   - `\a` -> U+0007 (bell)           e.g. `\alpha` -> BEL + "lpha"
 *   - `\b` -> U+0008 (backspace)      e.g. `\beta`  -> BS + "eta"
 *   - `\t` -> U+0009 (tab)            e.g. `\to`    -> TAB + "o"
 *   - `\v` -> U+000B (vertical tab)   e.g. `\vec`   -> VT + "ec"
 *   - `\f` -> U+000C (form feed)      e.g. `\frac`  -> FF + "rac"
 *   - `\r` -> U+000D (carriage ret.)  e.g. `\rho`   -> CR + "ho"
 *   - invalid escapes (`\i`, `\l`, `\s`, `\c`, ...) -> the `\` becomes U+0000
 *     (null) with the command letters intact, e.g. `\infty` -> NUL + "infty".
 * Mapping each control char back to its backslash form restores the command.
 * (BEL/`\a` and VT/`\v` were previously missed, so `\alpha`-family and
 * `\vec`-family commands rendered as KaTeX error boxes — the bug this fixes.)
 *
 * U+000A (LF) is deliberately NOT repaired: real line breaks are far more common
 * than `\n…` commands, so we leave newlines alone and accept that the rare
 * `\nabla`/`\ne` won't be recovered. Correctly escaped output has no control
 * chars, so clean messages pass through untouched.
 */
function repairLatexEscapes(value: string): string {
  return value.replace(/[\u0000\u0007\u0008\u0009\u000b\u000c\u000d]/g, (ch) => LATEX_ESCAPE_REPAIRS[ch] ?? ch);
}

/**
 * Full cleanup for ONE AI-generated text field before it reaches MathText:
 *   1. {@link repairLatexEscapes} restores any control-char-mangled LaTeX
 *      backslashes (the OpenAI structured-output corruption), then
 *   2. {@link normalizeAiMath} auto-delimits any BARE LaTeX the model left
 *      undelimited (the challenge-prompt render bug) by wrapping it in `$...$`,
 *      while leaving already-delimited math, prose, and currency untouched.
 * Only AI-generated content is passed through here; authored lesson/bank content
 * (already correctly delimited) never is.
 */
function cleanAiMathText(value: string): string {
  return normalizeAiMath(repairLatexEscapes(value));
}

/**
 * Validates/normalizes the callable's returned payload. `message` is required;
 * the optional `misconception` is kept only when it is a non-empty string.
 * Returns `null` for anything unusable so callers fall back to static text.
 */
function coerceTutorResponse(data: unknown): TutorResponse | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const candidate = data as Partial<Record<keyof TutorResponse, unknown>>;
  // Repair control-char-mangled backslashes AND auto-delimit bare LaTeX BEFORE
  // the empty-check/trim so the recovered, render-ready text is preserved.
  const message =
    typeof candidate.message === 'string' ? cleanAiMathText(candidate.message).trim() : '';

  if (!message) {
    return null;
  }

  const response: TutorResponse = { message };

  if (typeof candidate.misconception === 'string') {
    const misconception = cleanAiMathText(candidate.misconception).trim();
    if (misconception) {
      response.misconception = misconception;
    }
  }

  return response;
}

/**
 * Validates/normalizes the batch callable's payload. Repairs LaTeX in the hint
 * and every per-choice message/misconception, drops entries missing a choiceId or
 * message, and returns `null` only when NOTHING usable remains (no hint and no
 * choices) so callers fall back to static text. A usable hint with no choices (or
 * vice versa) is still returned; the hook serves whichever parts are present.
 */
function coercePrefetchResponse(data: unknown): PrefetchTutorResponse | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const candidate = data as Record<string, unknown>;
  const hint =
    typeof candidate.hint === 'string' ? cleanAiMathText(candidate.hint).trim() : '';

  const rawPerChoice: unknown[] = Array.isArray(candidate.perChoice) ? candidate.perChoice : [];
  const perChoice: PrefetchPerChoiceResponse[] = [];
  for (const entry of rawPerChoice) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const choice = entry as Record<string, unknown>;
    const choiceId = typeof choice.choiceId === 'string' ? choice.choiceId.trim() : '';
    const message =
      typeof choice.message === 'string' ? cleanAiMathText(choice.message).trim() : '';
    if (!choiceId || !message) {
      continue;
    }

    const item: PrefetchPerChoiceResponse = { choiceId, message };
    if (typeof choice.misconception === 'string') {
      const misconception = cleanAiMathText(choice.misconception).trim();
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
 * Validates/normalizes the challenge callable's payload. The server already
 * repairs LaTeX and validates structure, but we re-apply the repair and re-check
 * each question defensively (it is unvalidated AI content driving the UI): keep
 * only questions with a non-empty prompt, >= {@link MIN_CHALLENGE_CHOICES}
 * labeled choices, and a `correctChoiceId` matching one of them, synthesizing a
 * unique id when needed. Returns `null` unless at least `count` valid questions
 * survive, so callers SKIP the round rather than show a broken one.
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

    const prompt =
      typeof question.prompt === 'string' ? cleanAiMathText(question.prompt).trim() : '';

    const rawChoices: unknown[] = Array.isArray(question.choices) ? question.choices : [];
    const choices: { id: string; label: string }[] = [];
    const seenChoiceIds = new Set<string>();
    for (const choiceEntry of rawChoices) {
      if (!choiceEntry || typeof choiceEntry !== 'object') {
        continue;
      }
      const choice = choiceEntry as Record<string, unknown>;
      const id = typeof choice.id === 'string' ? choice.id.trim() : '';
      const label = typeof choice.label === 'string' ? cleanAiMathText(choice.label).trim() : '';
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
      typeof question.explanation === 'string'
        ? cleanAiMathText(question.explanation).trim()
        : '';
    const targetConcept =
      typeof question.targetConcept === 'string'
        ? cleanAiMathText(question.targetConcept).trim()
        : '';

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
 * Marks a tutor request that exceeded {@link HARD_TIMEOUT_MS}, so the failure
 * reason can be reported distinctly ("Timed out after Ns") instead of as a
 * generic error.
 */
class TutorTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`AI tutor request timed out after ${timeoutMs}ms`);
    this.name = 'TutorTimeoutError';
  }
}

// Races a promise against a timeout so a slow/hung call can never block the UI.
// The underlying request is abandoned (its result ignored) on timeout. This is a
// backstop on top of the callable SDK's own timeout option.
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
 * Builds a concise, human-readable failure reason from a caught error. Handles
 * the local timeout backstop, the callable SDK's own `functions/deadline-exceeded`
 * timeout, and Firebase callable errors (which carry a `code` such as
 * `functions/unauthenticated` or `functions/unavailable` plus the server message
 * thrown by the Cloud Function). Used only for the dev-only diagnostic note;
 * callers still fall back to static text on any failure.
 */
function describeError(error: unknown): string {
  if (error instanceof TutorTimeoutError) {
    return `Timed out after ${Math.round(error.timeoutMs / 1000)}s`;
  }

  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    const codeStr = typeof code === 'string' ? code : typeof code === 'number' ? String(code) : '';

    // The callable SDK maps its own timeout option to this code; surface it as a
    // clean timeout reason rather than a generic message.
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
 * never throws — whenever the tutor is disabled, the device is offline, the user
 * is not signed in, the callable cannot be built, the call times out, or the
 * response is unusable. Callers MUST treat `null` as "show the static response
 * instead".
 *
 * The optional `onErrorDetail` callback receives a concise, human-readable reason
 * whenever the result is `null` (e.g. "AI tutor disabled (...)", "Device is
 * offline", "Timed out after 8s", or a callable error such as "Sign in to use
 * the AI coach. — functions/unauthenticated"). It is purely diagnostic —
 * surfaced only in dev builds — and never alters the null-means-static contract.
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
 * Pre-generates ALL of one question's coaching in a SINGLE call: the hint plus a
 * tailored message for every answer choice. Returns `null` — never throws — on
 * the same conditions as {@link generateTutorResponse} (disabled, offline, not
 * signed in, init/timeout/parse failure), so callers cache the batch when present
 * and fall back to static text otherwise. The optional `onErrorDetail` receives a
 * concise, dev-only reason whenever the result is `null`.
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
 * Generates a short "challenge round" of brand-new MC questions tailored to how
 * the learner did on the questions they just answered. Returns `null` — never
 * throws — on the same conditions as {@link generateTutorResponse} (disabled,
 * offline, not signed in, init/timeout/parse failure) AND when the AI is over
 * quota (HTTP 429 surfaces as a callable error), so callers SKIP the round and
 * fall straight through to the normal summary. The optional `onErrorDetail`
 * receives a concise, dev-only reason whenever the result is `null`.
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
    // The caller may pass a SHORTER timeout (e.g. the practice "fast first
    // challenge question" path requests count=1 with a tight deadline and falls
    // back to a static bank question if the model is slow). The callable's own
    // SDK timeout stays at its longer default; this backstop just stops the UI
    // waiting past `timeoutMs`.
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
