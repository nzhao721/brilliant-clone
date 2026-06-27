import { useRef, useState, type ChangeEvent } from 'react';
import {
  generateWorkHint,
  isAiTutorEnabled,
  type TutorResponse,
  type WorkHintResponse,
} from '../lib/ai';
import { fileToWorkImage, WORK_FILE_ACCEPT_ATTR } from '../lib/workImage';
import { AiTutorFeedback, AiTutorMessage } from './AiTutorMessage';
import { Whiteboard } from './Whiteboard';
import './WorkReviewHint.css';

/*
 * PRACTICE-ONLY "review my work" affordance. Lets a student attach their actual
 * handwritten work — an uploaded picture/PDF OR a whiteboard drawing — and ask the
 * AI whether they're on the right track (vision hint via generateWorkHint). It is
 * deliberately NOT used by the lesson player.
 *
 * Contract mirrors the rest of the AI layer: the whole affordance is hidden unless
 * the AI tutor is enabled + online, and every failure falls back gracefully (to the
 * existing prefetched text hint when present, otherwise a gentle note) — it never
 * throws and never blocks answering.
 *
 * Source precedence: the MOST RECENTLY provided work wins. Uploading sets the
 * active source to the upload; drawing on the whiteboard sets it to the whiteboard.
 * If only one exists, that one is used.
 */

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** The prefetched text-hint state (from useAiTutor), shown when no work is attached. */
export type WorkReviewTextHint = {
  /** Whether AI will handle the text hint (enabled + online). */
  active: boolean;
  result: TutorResponse | null;
  error: boolean;
  errorDetail?: string | null;
  /** Triggers/ensures the text-hint prefetch. */
  onRequest: () => void;
};

type WorkReviewHintProps = {
  prompt: string;
  choices: { id: string; label: string }[];
  correctChoiceId: string;
  profileSummary?: string;
  /** Existing prefetched text hint (bank questions). Omitted for challenge questions. */
  textHint?: WorkReviewTextHint;
};

type Source = 'upload' | 'whiteboard';

export function WorkReviewHint({
  prompt,
  choices,
  correctChoiceId,
  profileSummary,
  textHint,
}: WorkReviewHintProps) {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [whiteboardImage, setWhiteboardImage] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [processingUpload, setProcessingUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [workResult, setWorkResult] = useState<WorkHintResponse | null>(null);
  const [workLoading, setWorkLoading] = useState(false);
  const [workError, setWorkError] = useState(false);
  const [workErrorDetail, setWorkErrorDetail] = useState<string | null>(null);
  const [textRequested, setTextRequested] = useState(false);

  // Guards against a stale async work-hint resolving over a newer request.
  const requestIdRef = useRef(0);

  // Gate the whole feature on the AI contract (hidden when disabled/offline).
  if (!isAiTutorEnabled() || !isOnline()) {
    return null;
  }

  const currentWorkImage =
    activeSource === 'whiteboard'
      ? whiteboardImage
      : activeSource === 'upload'
        ? uploadedImage
        : (uploadedImage ?? whiteboardImage);

  const resetHintOutput = () => {
    setWorkResult(null);
    setWorkError(false);
    setWorkErrorDetail(null);
    setTextRequested(false);
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) {
      return;
    }
    setProcessingUpload(true);
    setUploadError(null);
    resetHintOutput();
    const image = await fileToWorkImage(file);
    setProcessingUpload(false);
    if (!image) {
      setUploadError('Couldn’t read that file. Try a PNG, JPEG, WebP, or PDF a few MB or smaller.');
      return;
    }
    setUploadedImage(image);
    setActiveSource('upload');
  };

  const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    // Reset so picking the same file again still fires a change.
    event.target.value = '';
    void handleFile(file);
  };

  const handleWhiteboardChange = (dataUrl: string | null) => {
    setWhiteboardImage(dataUrl);
    if (dataUrl) {
      setActiveSource('whiteboard');
      resetHintOutput();
    } else if (activeSource === 'whiteboard') {
      setActiveSource(uploadedImage ? 'upload' : null);
    }
  };

  const clearUpload = () => {
    setUploadedImage(null);
    setUploadError(null);
    if (activeSource === 'upload') {
      setActiveSource(whiteboardImage ? 'whiteboard' : null);
    }
    resetHintOutput();
  };

  const handleGetHint = async () => {
    const image = currentWorkImage;
    if (!image) {
      // No work attached → keep the existing text-hint behavior (bank questions).
      if (textHint) {
        setTextRequested(true);
        textHint.onRequest();
      }
      return;
    }

    const requestId = (requestIdRef.current += 1);
    setTextRequested(false);
    setWorkResult(null);
    setWorkError(false);
    setWorkErrorDetail(null);
    setWorkLoading(true);

    const response = await generateWorkHint(
      {
        prompt,
        choices: choices.map((choice) => choice.label),
        correctLabel: choices.find((choice) => choice.id === correctChoiceId)?.label ?? '',
        ...(profileSummary ? { profileSummary } : {}),
        workImage: image,
      },
      (detail) => setWorkErrorDetail(detail),
    );

    // Ignore a superseded request (newer upload/draw/hint started meanwhile).
    if (requestId !== requestIdRef.current) {
      return;
    }
    setWorkLoading(false);
    if (response) {
      setWorkResult(response);
    } else {
      setWorkError(true);
    }
  };

  const hasWork = Boolean(currentWorkImage);
  const buttonLabel = hasWork ? 'Check my work' : 'Get a hint';
  const buttonDisabled = workLoading || processingUpload || (!hasWork && !textHint);
  const sourceLabel = activeSource === 'whiteboard' ? 'scratch paper' : 'upload';

  return (
    <section className="work-review" aria-label="Review your work">
      <p className="work-review-heading">Stuck? Get an AI hint on your actual work.</p>

      <div className="work-review-controls">
        <label className={`work-review-upload${processingUpload ? ' is-busy' : ''}`}>
          {processingUpload ? 'Reading…' : 'Upload work'}
          <input
            type="file"
            accept={WORK_FILE_ACCEPT_ATTR}
            onChange={onFileInputChange}
            disabled={processingUpload}
          />
        </label>
        <button
          type="button"
          className={`work-review-toggle${showWhiteboard ? ' is-active' : ''}`}
          aria-pressed={showWhiteboard}
          onClick={() => setShowWhiteboard((value) => !value)}
        >
          {showWhiteboard ? 'Hide scratch paper' : 'Scratch paper'}
        </button>
      </div>

      {uploadError ? (
        <p className="work-review-error" role="alert">
          {uploadError}
        </p>
      ) : null}

      {uploadedImage ? (
        <div className="work-review-preview">
          <img src={uploadedImage} alt="Preview of your uploaded work" />
          <button type="button" className="work-review-clear" onClick={clearUpload}>
            Remove
          </button>
        </div>
      ) : null}

      {showWhiteboard ? <Whiteboard onChange={handleWhiteboardChange} /> : null}

      <div className="work-review-actions">
        <button
          type="button"
          className="primary-button work-review-submit"
          onClick={handleGetHint}
          disabled={buttonDisabled}
        >
          {buttonLabel}
        </button>
        {hasWork ? <span className="work-review-source">Using your {sourceLabel}</span> : null}
      </div>

      {workLoading || workResult ? (
        <AiTutorMessage
          loading={workLoading}
          result={workResult ? { message: workResult.message } : null}
          tone="hint"
        />
      ) : workError ? (
        <>
          <p className="work-review-fallback" role="note">
            I couldn’t review your work right now. Give it another try, or work through it one step
            at a time.
          </p>
          {import.meta.env.DEV && workErrorDetail ? (
            <p className="ai-tutor-debug" role="note">
              <span className="ai-tutor-debug-label">AI coach unavailable (testing):</span>{' '}
              {workErrorDetail}
            </p>
          ) : null}
        </>
      ) : textRequested && textHint ? (
        <AiTutorFeedback
          active={textHint.active}
          result={textHint.result}
          error={textHint.error}
          errorDetail={textHint.errorDetail}
          tone="hint"
          fallback={
            <p className="work-review-fallback" role="note">
              Add a photo of your work or use the scratch paper, and I’ll check whether you’re on the
              right track.
            </p>
          }
        />
      ) : null}
    </section>
  );
}
