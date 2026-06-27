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
 * Badge at the start of every AI note; the decorative sparkle carries an
 * "AI-generated" accessible name so the cue is announced.
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
 * Presentational AI chip: loader while thinking, badged message once it returns,
 * else nothing. AI-vs-static gating lives in {@link AiTutorFeedback}.
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
  /** Why the AI attempt failed; renders a dev-only diagnostic, never in production. */
  errorDetail?: string | null;
};

/**
 * Picks the AI coach or the static fallback for one feedback instance (AI when
 * available): inactive -> static; pending -> loader; returned -> AI message;
 * error -> fallback. `active` is synchronous and pending keys off `!result`, so
 * the static text never flashes before the loader. Dev builds add a failure note.
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

  /* Dev-only: surface why the AI fell back, when an attempt failed with a reason. */
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
