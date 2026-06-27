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

/*
 * Shared AI tutor hook for lessons AND practice. PRE-GENERATES all of a question's
 * coaching in one batched call (hint + a message per choice), caches it by
 * questionId, and serves the matching message instantly on submit/hint. Purely
 * additive: on any failure `result` stays null / `error` flips on and callers
 * render their static text.
 */

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
 * WHEN the batch prefetch fires. `'on-display'` fires as soon as a question shows;
 * `'on-first-interaction'` defers until a hint/submit. Flip this one flag — the
 * trigger effect and `requestHint` both honor it.
 */
export const PREFETCH_TRIGGER: 'on-display' | 'on-first-interaction' = 'on-display';

type PrefetchOutcome = {
  /** The parsed batch, or null when the prefetch failed / returned nothing usable. */
  batch: PrefetchTutorResponse | null;
  /** Dev-only failure reason (null on success). */
  detail: string | null;
};

/* Settled prefetch outcomes by questionId (failures cached as batch: null), so a
 * question is prefetched at most once per session. */
const prefetchResults = new Map<string, PrefetchOutcome>();
/* In-flight prefetches by questionId, so concurrent/remounted hooks share one request. */
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
 * Starts (or returns the in-flight) prefetch for a question, caching the settled
 * outcome (success or failure) so each question is computed at most once.
 */
function startPrefetch(questionId: string, input: PrefetchTutorInput): Promise<PrefetchOutcome> {
  const existing = prefetchInflight.get(questionId);
  if (existing) {
    return existing;
  }

  /* Captured synchronously so the failure reason is available when result is null. */
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

  /* Always-current params for async closures (and keeps `progress` out of deps). */
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const [online, setOnline] = useState(isOnline);
  // Bump to re-render this hook when a prefetch it cares about settles.
  const [, setTick] = useState(0);
  const forceRender = useCallback(() => setTick((tick) => tick + 1), []);

  const active = isAiTutorEnabled() && online;
  const answered = isCorrect !== null && chosenChoiceId !== '';

  /* Kick off the prefetch (idempotent) and re-render when it settles, including
   * remounts joining a previous instance's call. */
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

  /* Offline reverts to static (active flips false); back online re-enables prefetch. */
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

  /* Trigger the prefetch: 'on-display' fires once active + shown; otherwise it
   * waits for a submit (here) or hint (requestHint). Idempotent either way. */
  useEffect(() => {
    if (!active || !questionId) {
      return;
    }
    if (PREFETCH_TRIGGER === 'on-display' || answered) {
      prefetch();
    }
  }, [active, questionId, answered, prefetch]);

  /* A hint serves the SAME cached batch; also the prefetch trigger under
   * 'on-first-interaction'. */
  const requestHint = useCallback(() => {
    prefetch();
  }, [prefetch]);

  /* Derive visible state from the cached batch + context, recomputed every render
   * so a prior interaction's result/error never leaks into a new one. */
  let result: TutorResponse | null = null;
  let error = false;
  let loading = false;
  let errorDetail: string | null = null;

  if (active && questionId) {
    const settled = prefetchResults.get(questionId);

    if (!settled) {
      /* In flight or about to start: show the loader (never static) while we CAN
       * prefetch, so static text never flashes before the batch resolves. */
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
