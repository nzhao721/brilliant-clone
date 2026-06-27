import type { ReactNode } from 'react';
import type { TutorResponse } from '../lib/ai';
import { AiSparkIcon } from './AiSparkIcon';
import { MathText } from './MathText';
import './AiTutorMessage.css';

type AiTutorTone = 'correct' | 'incorrect' | 'hint';

type AiTutorMessageProps = {
  loading: boolean;
  result: TutorResponse | null;
  tone: AiTutorTone;
};

const TONE_LABEL: Record<AiTutorTone, string> = {
  correct: 'AI coach',
  incorrect: 'AI coach',
  hint: 'AI hint',
};

/**
 * The badge shown at the start of every AI note. The sparkle marks the content
 * as AI-generated so it is never confused with the static fallback (which is a
 * separate, unbadged block). The glyph is decorative; the wrapping span carries
 * the accessible "AI-generated" name so the cue is announced, not just seen.
 */
function AiTutorBadge({ tone }: { tone: AiTutorTone }) {
  return (
    <span className="ai-tutor-badge">
      <span className="ai-tutor-badge-mark" role="img" aria-label="AI-generated">
        <AiSparkIcon className="ai-tutor-badge-icon" />
      </span>
      {TONE_LABEL[tone]}
    </span>
  );
}

/**
 * Presentational AI chip. Renders the "thinking" loader while the model is
 * working and the badged message once it returns; renders nothing otherwise.
 * Gating (AI vs. static) lives in {@link AiTutorFeedback}; this component just
 * draws whichever AI state it is handed.
 */
export function AiTutorMessage({ loading, result, tone }: AiTutorMessageProps) {
  if (loading && !result) {
    return (
      <div
        className={`ai-tutor-note ai-tutor-${tone} ai-tutor-loading`}
        role="status"
        aria-live="polite"
      >
        <AiTutorBadge tone={tone} />
        <span className="ai-tutor-thinking" aria-label="The AI tutor is thinking">
          <span className="ai-tutor-dot" />
          <span className="ai-tutor-dot" />
          <span className="ai-tutor-dot" />
        </span>
      </div>
    );
  }

  if (!result) {
    return null;
  }

  return (
    <div className={`ai-tutor-note ai-tutor-${tone}`} aria-live="polite">
      <AiTutorBadge tone={tone} />
      <div className="ai-tutor-message">
        <MathText text={result.message} />
      </div>
    </div>
  );
}

type AiTutorFeedbackProps = {
  /** Whether AI will handle this feedback instance (enabled + online). */
  active: boolean;
  result: TutorResponse | null;
  /** True once the AI request has resolved with no usable message (timeout/error). */
  error: boolean;
  tone: AiTutorTone;
  /** The static block shown when AI is inactive or has fallen back. */
  fallback: ReactNode;
  /**
   * Why the AI attempt failed (from {@link useAiTutor}). Used ONLY to render a
   * dev-only diagnostic note when an attempt was actually made and failed; it is
   * never shown in production or for the disabled/offline-by-design path.
   */
  errorDetail?: string | null;
};

/**
 * Decides, for ONE feedback instance, between the AI coach and the static
 * fallback — preferring AI whenever it is available:
 *
 *  - AI inactive (disabled/offline)        -> static immediately (no spinner)
 *  - AI active, request pending            -> loader only (static stays hidden)
 *  - AI active, message returned           -> AI coach message (static hidden)
 *  - AI active, resolved with null (error) -> static fallback
 *
 * `active` is derived synchronously by {@link useAiTutor}, and the pending case
 * is keyed off `!result` (not the async `loading` flag). So the FIRST render
 * after a submit/hint already routes to the loader and the static text never
 * flashes for a frame before the spinner appears.
 *
 * In dev builds only, when an AI attempt was actually made and FAILED, a small
 * diagnostic note is rendered beside the static block so the underlying reason
 * is visible while debugging. It never appears in production or for the
 * disabled/offline-by-design path.
 */
export function AiTutorFeedback({
  active,
  result,
  error,
  tone,
  fallback,
  errorDetail,
}: AiTutorFeedbackProps) {
  if (active && !error) {
    return <AiTutorMessage loading={!result} result={result} tone={tone} />;
  }

  // Dev-only diagnostic: surface WHY the AI fell back, but ONLY when an attempt
  // was actually made and failed (in this branch `active` implies `error`) and a
  // reason was captured. `import.meta.env.DEV` keeps it out of production, and
  // the `active`/`errorDetail` gate keeps it off the intentional disabled/offline
  // path — and out of the test runner, where AI never attempts a call.
  const showFailureNote = import.meta.env.DEV && active && Boolean(errorDetail);

  return (
    <>
      {fallback}
      {showFailureNote ? (
        <p className="ai-tutor-debug" role="note">
          <span className="ai-tutor-debug-label">AI coach unavailable (testing):</span>{' '}
          {errorDetail}
        </p>
      ) : null}
    </>
  );
}
