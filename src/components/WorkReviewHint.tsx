import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../auth/AuthContext';
import {
  checkAiAvailability,
  generateWorkHint,
  isAiTutorEnabled,
  type TutorResponse,
  type WorkHintResponse,
} from '../lib/ai';
import {
  fileToWorkImages,
  MAX_WORK_FILE_BYTES,
  MAX_WORK_IMAGES,
  WORK_FILE_ACCEPT_ATTR,
  WORK_SIZE_LIMIT_TEXT,
} from '../lib/workImage';
import { AiTutorFeedback, AiTutorMessage } from './AiTutorMessage';
import { Whiteboard } from './Whiteboard';
import './WorkReviewHint.css';

/*
 * PRACTICE-ONLY "review my work" affordance. The practice card shows an "AI Hint"
 * button beside Submit; clicking it opens a POP-UP (modal) that holds the whole
 * work-review UI — photo upload (multiple pages), the full-screen whiteboard
 * launcher, and the hint result. It is deliberately NOT used by the lesson player.
 *
 * When the pop-up opens it PRE-CHECKS availability: instant client guards first
 * (disabled / offline / signed-out → unavailable message, no options), otherwise a
 * brief "Checking…" while a lightweight backend probe detects out-of-quota (429) /
 * server errors. Options appear only when the probe reports available; Retry
 * re-runs the check. Every failure still falls back gracefully and never throws.
 *
 * Source precedence: the MOST RECENTLY provided work wins. An upload can be MANY
 * images (pages); the whiteboard is a single image. The chosen source is sent to
 * the vision hint as an ARRAY of images.
 */

const MAX_WORK_FILE_MB = Math.round(MAX_WORK_FILE_BYTES / (1024 * 1024));

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
type Availability = 'idle' | 'checking' | 'available' | 'unavailable';
type UploadedPage = { id: string; src: string; label: string };

/** Maps an unavailability reason to a concrete, user-facing sentence. */
function reasonText(reason: string | null): string {
  switch (reason) {
    case 'offline':
      return 'You appear to be offline. Reconnect and try again.';
    case 'signed-out':
      return 'Sign in to use the AI coach.';
    case 'disabled':
      return 'The AI coach is turned off right now.';
    case 'over-quota':
      return 'The AI coach has reached its usage limit. Please try again later.';
    default:
      return 'The AI coach isn’t reachable right now. Please try again.';
  }
}

export function WorkReviewHint({
  prompt,
  choices,
  correctChoiceId,
  profileSummary,
  textHint,
}: WorkReviewHintProps) {
  const { user } = useAuth();
  const signedIn = Boolean(user);

  const [open, setOpen] = useState(false);
  const [availability, setAvailability] = useState<Availability>('idle');
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);

  const [uploadedPages, setUploadedPages] = useState<UploadedPage[]>([]);
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

  const requestIdRef = useRef(0);
  const checkIdRef = useRef(0);
  const pageIdRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const uploadImages = uploadedPages.map((page) => page.src);
  const currentWorkImages =
    activeSource === 'whiteboard'
      ? whiteboardImage
        ? [whiteboardImage]
        : []
      : activeSource === 'upload'
        ? uploadImages
        : uploadImages.length > 0
          ? uploadImages
          : whiteboardImage
            ? [whiteboardImage]
            : [];
  const hasWork = currentWorkImages.length > 0;

  const resetHintOutput = () => {
    setWorkResult(null);
    setWorkError(false);
    setWorkErrorDetail(null);
    setTextRequested(false);
  };

  // ----- Availability pre-check -------------------------------------------------

  const runAvailabilityCheck = () => {
    const checkId = (checkIdRef.current += 1);
    setUploadError(null);
    // Instant client-side guards — no probe, no options.
    if (!isAiTutorEnabled()) {
      setAvailability('unavailable');
      setUnavailableReason('disabled');
      return;
    }
    if (!isOnline()) {
      setAvailability('unavailable');
      setUnavailableReason('offline');
      return;
    }
    if (!signedIn) {
      setAvailability('unavailable');
      setUnavailableReason('signed-out');
      return;
    }

    setAvailability('checking');
    setUnavailableReason(null);
    void (async () => {
      const status = await checkAiAvailability();
      if (checkId !== checkIdRef.current) {
        return;
      }
      if (status.available) {
        setAvailability('available');
      } else {
        setAvailability('unavailable');
        setUnavailableReason(status.reason ?? 'unavailable');
      }
    })();
  };

  const openModal = () => {
    setOpen(true);
    runAvailabilityCheck();
  };

  const closeModal = () => {
    setOpen(false);
  };

  // Move focus into the dialog when it opens (accessibility).
  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
    }
  }, [open]);

  // Escape closes the modal — but NOT while the full-screen whiteboard is up (it
  // owns Escape then), so one press doesn't dismiss both.
  useEffect(() => {
    if (!open || showWhiteboard) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, showWhiteboard]);

  // ----- Uploads (multiple files / pages) --------------------------------------

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    setProcessingUpload(true);
    setUploadError(null);
    resetHintOutput();

    const errors: string[] = [];
    const added: UploadedPage[] = [];
    let remaining = MAX_WORK_IMAGES - uploadedPages.length;
    let truncated = false;

    for (const file of Array.from(files)) {
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      if (file.size > MAX_WORK_FILE_BYTES) {
        errors.push(`${file.name} is over the ${MAX_WORK_FILE_MB} MB per-file limit.`);
        continue;
      }
      const pages = await fileToWorkImages(file);
      if (pages.length === 0) {
        errors.push(`Couldn’t read ${file.name}.`);
        continue;
      }
      pages.forEach((src, index) => {
        if (remaining <= 0) {
          truncated = true;
          return;
        }
        const label = pages.length > 1 ? `${file.name} · p${index + 1}` : file.name;
        added.push({ id: `wp-${(pageIdRef.current += 1)}`, src, label });
        remaining -= 1;
      });
    }

    setProcessingUpload(false);

    if (added.length > 0) {
      setUploadedPages((prev) => [...prev, ...added]);
      setActiveSource('upload');
    }
    if (truncated) {
      errors.push(`Reached the ${MAX_WORK_IMAGES}-page limit — some pages were skipped.`);
    }
    if (errors.length > 0) {
      setUploadError(errors.join(' '));
    }
  };

  const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    // Reset so picking the same file(s) again still fires a change.
    event.target.value = '';
    void handleFiles(files);
  };

  const removePage = (id: string) => {
    const next = uploadedPages.filter((page) => page.id !== id);
    setUploadedPages(next);
    if (next.length === 0 && activeSource === 'upload') {
      setActiveSource(whiteboardImage ? 'whiteboard' : null);
    }
    resetHintOutput();
  };

  const clearAllUploads = () => {
    setUploadedPages([]);
    setUploadError(null);
    if (activeSource === 'upload') {
      setActiveSource(whiteboardImage ? 'whiteboard' : null);
    }
    resetHintOutput();
  };

  // ----- Whiteboard ------------------------------------------------------------

  const handleWhiteboardChange = (dataUrl: string | null) => {
    setWhiteboardImage(dataUrl);
    if (dataUrl) {
      setActiveSource('whiteboard');
      resetHintOutput();
    } else if (activeSource === 'whiteboard') {
      setActiveSource(uploadImages.length > 0 ? 'upload' : null);
    }
  };

  const handleWhiteboardSubmit = (dataUrl: string | null) => {
    setShowWhiteboard(false);
    if (!dataUrl) {
      return;
    }
    setWhiteboardImage(dataUrl);
    setActiveSource('whiteboard');
    void runWorkHint([dataUrl]);
  };

  // ----- Hint request ----------------------------------------------------------

  const runWorkHint = async (images: string[]) => {
    if (images.length === 0) {
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
        workImages: images,
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

  const handleGetHint = () => {
    if (!hasWork) {
      // No work attached → keep the existing text-hint behavior (bank questions).
      if (textHint) {
        setTextRequested(true);
        textHint.onRequest();
      }
      return;
    }
    void runWorkHint(currentWorkImages);
  };

  const buttonLabel = hasWork ? 'Check my work' : 'Get a hint';
  const buttonDisabled = workLoading || processingUpload || (!hasWork && !textHint);
  const uploadCount = uploadImages.length;
  const sourceLabel =
    activeSource === 'whiteboard'
      ? 'scratch paper'
      : uploadCount > 1
        ? `${uploadCount} uploaded pages`
        : 'upload';

  const workReviewBody = (
    <>
      <p className="work-review-heading">Stuck? Get an AI hint on your actual work.</p>

      <div className="work-review-controls">
        <label className={`work-review-upload${processingUpload ? ' is-busy' : ''}`}>
          {processingUpload ? 'Reading…' : 'Upload work'}
          <input
            type="file"
            accept={WORK_FILE_ACCEPT_ATTR}
            multiple
            onChange={onFileInputChange}
            disabled={processingUpload}
          />
        </label>
        <button
          type="button"
          className={`work-review-toggle${whiteboardImage ? ' is-active' : ''}`}
          aria-haspopup="dialog"
          onClick={() => setShowWhiteboard(true)}
        >
          {whiteboardImage ? 'Edit scratch paper' : 'Scratch paper'}
        </button>
      </div>

      <p className="work-review-limits">{WORK_SIZE_LIMIT_TEXT}</p>

      {uploadError ? (
        <p className="work-review-error" role="alert">
          {uploadError}
        </p>
      ) : null}

      {uploadedPages.length > 0 ? (
        <div className="work-review-previews">
          <ul className="work-review-preview-list">
            {uploadedPages.map((page) => (
              <li key={page.id} className="work-review-preview-item">
                <img src={page.src} alt={`Preview of ${page.label}`} />
                <span className="work-review-preview-name">{page.label}</span>
                <button
                  type="button"
                  className="work-review-clear"
                  onClick={() => removePage(page.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="work-review-clear-all" onClick={clearAllUploads}>
            Clear all
          </button>
        </div>
      ) : null}

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
    </>
  );

  const unavailableBody = (
    <div className="work-review-availability" role="status">
      <p className="work-review-availability-title">AI hint isn’t available right now</p>
      <p className="work-review-availability-reason">{reasonText(unavailableReason)}</p>
      <button type="button" className="secondary-button" onClick={runAvailabilityCheck}>
        Retry
      </button>
    </div>
  );

  const checkingBody = (
    <div className="work-review-availability" role="status" aria-live="polite">
      <span className="work-review-spinner" aria-hidden="true" />
      <p className="work-review-availability-reason">Checking the AI coach…</p>
    </div>
  );

  return (
    <>
      <button
        type="button"
        className="secondary-button work-review-hint-trigger"
        aria-haspopup="dialog"
        onClick={openModal}
      >
        AI Hint
      </button>

      {open
        ? createPortal(
            <div
              className="work-review-modal-overlay"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closeModal();
                }
              }}
            >
              <div
                ref={dialogRef}
                className="work-review-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
              >
                <div className="work-review-modal-header">
                  <h2 id={titleId} className="work-review-modal-title">
                    AI hint
                  </h2>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    className="work-review-modal-close"
                    aria-label="Close AI hint"
                    onClick={closeModal}
                  >
                    &times;
                  </button>
                </div>
                <div className="work-review-modal-body">
                  {availability === 'available'
                    ? workReviewBody
                    : availability === 'unavailable'
                      ? unavailableBody
                      : checkingBody}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Mounted persistently so a whiteboard drawing survives the modal closing;
          renders the full-screen overlay only while open. */}
      <Whiteboard
        open={showWhiteboard}
        onClose={() => setShowWhiteboard(false)}
        onChange={handleWhiteboardChange}
        onSubmit={handleWhiteboardSubmit}
        submitDisabled={workLoading}
      />
    </>
  );
}
