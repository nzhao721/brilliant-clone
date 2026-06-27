import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isAiTutorEnabled,
  prefetchTutorResponses,
  type PrefetchTutorInput,
  type PrefetchTutorResponse,
  type TutorResponse,
} from '../lib/ai';
import { buildLearnerProfileSummary } from './learnerProfile';
import type { LessonProgress } from './lessonProgress';

// ---------------------------------------------------------------------------
// Shared AI tutor hook for lessons AND practice.
//
// Instead of one model call per interaction, this PRE-GENERATES all of a
// question's coaching in a single batched call (the hint + a tailored message for
// every answer choice), caches it module-level by questionId, and serves the
// matching message INSTANTLY when the learner submits an answer or asks for a
// hint. It is purely additive: when AI is disabled/offline, the prefetch fails,
// or a particular choice/hint is missing, `result` stays null / `error` flips on
// and callers keep rendering their existing static text.
// ---------------------------------------------------------------------------

export type UseAiTutorParams = {
  questionId: string;
  prompt: string;
  /** Every answer choice (id + label) — needed to prefetch all choices at once. */
  choices?: { id: string; label: string }[];
  /** Id of the correct choice. */
  correctChoiceId?: string;
  /** The SUBMITTED choice id (empty until an answer is submitted). */
  chosenChoiceId: string;
  /** @deprecated Kept for back-compat; the batch no longer needs it. */
  chosenLabel?: string;
  /** @deprecated Kept for back-compat; the batch no longer needs it. */
  correctLabel?: string;
  /** null until an answer is submitted; then true/false. */
  isCorrect: boolean | null;
  /** Static hint shown as fallback (also sent to the model as reference). */
  staticHint?: string;
  /** Static explanation for the correct answer (sent to the model as reference). */
  staticCorrectExplanation?: string;
  /** Static explanation for incorrect answers (sent to the model as reference). */
  staticIncorrectExplanation?: string;
  /**
   * @deprecated Single static explanation; superseded by
   * {@link staticCorrectExplanation}/{@link staticIncorrectExplanation}. Ignored.
   */
  staticExplanation?: string;
  /**
   * For HINTS: a short description of the current step's on-screen interactive
   * (built by the caller from the step's `visual`), so the AI hint can explain
   * how to use it. Omitted when the step has no visual.
   */
  visualHint?: string;
  progress?: LessonProgress | null;
};

export type UseAiTutorResult = {
  loading: boolean;
  result: TutorResponse | null;
  error: boolean;
  requestHint: () => void;
  /**
   * For the MOST RECENT failed attempt, a concise human-readable reason the AI
   * call fell back to static text (e.g. "Timed out after 8s", "HTTP 403"); null
   * when AI succeeded or was never attempted (disabled/offline by design).
   * Optional so callers/test mocks that predate it stay valid. Diagnostic only —
   * the UI surfaces it solely in dev builds.
   */
  errorDetail?: string | null;
  /**
   * Whether the AI tutor will handle feedback in THIS environment (enabled AND
   * online). Derived synchronously on every render, so callers can decide — on
   * the very first frame after a submit/hint, before any effect runs — whether to
   * surface the AI loader or render their static text. When false, callers must
   * show the static fallback immediately (the unchanged AI-off/offline path).
   */
  active: boolean;
};

/**
 * WHEN the batch prefetch fires. `'on-display'` kicks it off as soon as a
 * question is shown so the matching message is ready instantly on submit/hint.
 * Flip this single flag to `'on-first-interaction'` to defer the call until the
 * learner actually requests a hint or submits an answer — no other change needed
 * (the trigger effect and `requestHint` both already honor it).
 */
export const PREFETCH_TRIGGER: 'on-display' | 'on-first-interaction' = 'on-display';

type PrefetchOutcome = {
  /** The parsed batch, or null when the prefetch failed / returned nothing usable. */
  batch: PrefetchTutorResponse | null;
  /** Dev-only failure reason (null on success). */
  detail: string | null;
};

// Settled prefetch outcomes, keyed by questionId. A FAILED prefetch is cached too
// (batch: null), so a question is never prefetched more than once per session.
const prefetchResults = new Map<string, PrefetchOutcome>();
// In-flight prefetches, keyed by questionId, so concurrent/remounted hooks share
// one request instead of each spending a model call.
const prefetchInflight = new Map<string, Promise<PrefetchOutcome>>();

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** Whether we have enough of a question to build a prefetch request. */
function canPrefetch(params: UseAiTutorParams): boolean {
  return Boolean(
    params.questionId &&
      params.prompt &&
      params.choices &&
      params.choices.length > 0 &&
      params.correctChoiceId,
  );
}

function buildPrefetchInput(params: UseAiTutorParams): PrefetchTutorInput | null {
  if (!canPrefetch(params)) {
    return null;
  }

  return {
    prompt: params.prompt,
    choices: (params.choices ?? []).map((choice) => ({ id: choice.id, label: choice.label })),
    correctChoiceId: params.correctChoiceId as string,
    profileSummary: buildLearnerProfileSummary(params.progress),
    ...(params.staticHint ? { staticHint: params.staticHint } : {}),
    ...(params.staticCorrectExplanation
      ? { staticCorrectExplanation: params.staticCorrectExplanation }
      : {}),
    ...(params.staticIncorrectExplanation
      ? { staticIncorrectExplanation: params.staticIncorrectExplanation }
      : {}),
    ...(params.visualHint ? { visualHint: params.visualHint } : {}),
  };
}

/**
 * Starts (or returns the already-running) prefetch for a question. Stores the
 * settled outcome — success OR failure — in the module cache and clears the
 * in-flight entry, so each question is computed at most once per session.
 */
function startPrefetch(questionId: string, input: PrefetchTutorInput): Promise<PrefetchOutcome> {
  const existing = prefetchInflight.get(questionId);
  if (existing) {
    return existing;
  }

  // Captured synchronously inside prefetchTutorResponses (before it resolves) so
  // the failure reason is available when the result settles to null.
  let detail: string | null = null;
  const pending = prefetchTutorResponses(input, (reason) => {
    detail = reason;
  })
    .then((batch): PrefetchOutcome => ({ batch, detail }))
    .catch((): PrefetchOutcome => ({ batch: null, detail }))
    .then((outcome) => {
      prefetchResults.set(questionId, outcome);
      prefetchInflight.delete(questionId);
      return outcome;
    });

  prefetchInflight.set(questionId, pending);
  return pending;
}

export function useAiTutor(params: UseAiTutorParams): UseAiTutorResult {
  const { questionId, chosenChoiceId, isCorrect } = params;

  // Always-current params for async closures, so the prefetch builder never reads
  // a stale render and `progress` isn't an effect dependency.
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const [online, setOnline] = useState(isOnline);
  // Bump to re-render this hook when a prefetch it cares about settles.
  const [, setTick] = useState(0);
  const forceRender = useCallback(() => setTick((tick) => tick + 1), []);

  const active = isAiTutorEnabled() && online;
  const answered = isCorrect !== null && chosenChoiceId !== '';

  // Kick off the prefetch (idempotent) and re-render this hook when it settles —
  // including remounts that join a call started by a previous instance.
  const prefetch = useCallback(() => {
    if (!isAiTutorEnabled() || !isOnline()) {
      return;
    }
    const id = paramsRef.current.questionId;
    if (!id || prefetchResults.has(id)) {
      return;
    }
    const input = buildPrefetchInput(paramsRef.current);
    if (!input) {
      return;
    }
    void startPrefetch(id, input).then(forceRender);
  }, [forceRender]);

  // Going offline reverts to static immediately (active flips false); coming back
  // online lets future questions prefetch again.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Trigger the prefetch. On 'on-display' it fires as soon as the question is
  // active + shown; on 'on-first-interaction' it waits for a submit (here) or a
  // hint request (via requestHint). `prefetch()` is idempotent and wires up the
  // re-render-on-settle either way.
  useEffect(() => {
    if (!active || !questionId) {
      return;
    }
    if (PREFETCH_TRIGGER === 'on-display' || answered) {
      prefetch();
    }
  }, [active, questionId, answered, prefetch]);

  // Showing a hint serves the SAME cached batch as the per-choice feedback. This
  // also acts as the hint's prefetch trigger under 'on-first-interaction'.
  const requestHint = useCallback(() => {
    prefetch();
  }, [prefetch]);

  // Derive the visible state from the cached batch + current context. Recomputed
  // every render, so a prior interaction's result/error can never leak into a new
  // one (no static-text flash to clean up).
  let result: TutorResponse | null = null;
  let error = false;
  let loading = false;
  let errorDetail: string | null = null;

  if (active && questionId) {
    const settled = prefetchResults.get(questionId);

    if (!settled) {
      // Either in flight or about to be started by the effect above. Show the
      // loader (never the static fallback) while we CAN prefetch, so the static
      // text never flashes for a frame before the batch resolves.
      if (canPrefetch(paramsRef.current) || prefetchInflight.has(questionId)) {
        loading = true;
      } else {
        error = true;
      }
    } else if (!settled.batch) {
      // Prefetch failed / returned nothing usable → static fallback (+ dev note).
      error = true;
      errorDetail = settled.detail;
    } else if (answered) {
      // Serve the pre-generated message for the chosen choice.
      const entry = settled.batch.perChoice.find((item) => item.choiceId === chosenChoiceId);
      if (entry) {
        result = entry.misconception
          ? { message: entry.message, misconception: entry.misconception }
          : { message: entry.message };
      } else {
        // No tailored message for this choice → static fallback.
        error = true;
        errorDetail = settled.detail;
      }
    } else if (settled.batch.hint) {
      // Not answered → hint context (shown only where the caller renders a hint).
      result = { message: settled.batch.hint };
    } else {
      // No usable hint in the batch → static hint fallback.
      error = true;
      errorDetail = settled.detail;
    }
  }

  return { loading, result, error, requestHint, active, errorDetail };
}
