import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../auth/AuthContext';
import {
  checkAiAvailability,
  generateWorkHint,
  isAiTutorEnabled,
  type WorkHintResponse,
} from '../lib/ai';
import {
  createBlankWorkImage,
  fileToWorkImages,
  MAX_WORK_FILE_BYTES,
  MAX_WORK_IMAGES,
  WORK_FILE_ACCEPT_ATTR,
  WORK_SIZE_LIMIT_TEXT,
} from '../lib/workImage';
import { AiTutorMessage } from './AiTutorMessage';
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
 *
 * WORK-GATED (practice only): the hint ALWAYS goes through the VISION call, even
 * with no work attached (a blank surface is sent). The model itself decides
 * whether the work shows substantial progress — only then does it return an
 * actual hint; otherwise it returns a "make a substantial start first" nudge with
 * NO hint. The gating is entirely model/prompt-driven; the client never fabricates
 * the message.
 */

const MAX_WORK_FILE_MB = Math.round(MAX_WORK_FILE_BYTES / (1024 * 1024));

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

type WorkReviewHintProps = {
  prompt: string;
  choices: { id: string; label: string }[];
  correctChoiceId: string;
  profileSummary?: string;
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
  };

  // Navigating BETWEEN the two views — the upload modal and the full-screen
  // scratch paper — must start the destination with NO hint: a hint produced in
  // one view must not appear in the other. So fully clear the hint output AND
  // cancel any in-flight request (bump the request id so runWorkHint discards a
  // pending response, and drop the loading flag) so a late result can't pop in on
  // the other page. The user's actual work — uploaded pages and the whiteboard
  // drawing — is deliberately preserved; only the hint output (and the transient
  // upload error) is reset.
  const resetHintsForNavigation = () => {
    requestIdRef.current += 1;
    setWorkLoading(false);
    resetHintOutput();
    setUploadError(null);
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

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    setProcessingUpload(true);
    setUploadError(null);
    resetHintOutput();

    const errors: string[] = [];
    const added: UploadedPage[] = [];
    let remaining = MAX_WORK_IMAGES - uploadedPages.length;
    let truncated = false;

    for (const file of files) {
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
    // Snapshot the chosen files into a plain array BEFORE resetting the input.
    // `input.files` is a LIVE FileList: clearing `value` (so the same file can be
    // re-picked) empties it, so handleFiles must receive the snapshot, not the
    // live list it would otherwise read after the reset.
    const files = event.target.files ? Array.from(event.target.files) : [];
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
    if (!dataUrl) {
      return;
    }
    setWhiteboardImage(dataUrl);
    setActiveSource('whiteboard');
    // Keep the scratch paper OPEN: the hint renders pinned to the bottom of the
    // overlay (see `whiteboardHint` → Whiteboard's `hint` slot) so the student can
    // read it while still seeing/iterating on their drawing and re-check. The
    // request-id guard in runWorkHint handles rapid re-checks.
    void runWorkHint([dataUrl]);
  };

  // Opening/closing the scratch paper is navigation BETWEEN the two views, so each
  // transition resets the hint (the drawing itself is preserved by leaving
  // `whiteboardImage` untouched).
  const openWhiteboard = () => {
    resetHintsForNavigation();
    setShowWhiteboard(true);
  };

  const closeWhiteboard = () => {
    resetHintsForNavigation();
    setShowWhiteboard(false);
  };

  // ----- Hint request ----------------------------------------------------------

  const runWorkHint = async (images: string[]) => {
    if (images.length === 0) {
      return;
    }
    const requestId = (requestIdRef.current += 1);
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
    /* ALWAYS run the VISION hint so the response is model-generated and gated by
     * the prompt. With no work attached, send a blank surface so the model itself
     * returns the "make a substantial start" nudge (never fabricated here). */
    void runWorkHint(hasWork ? currentWorkImages : [createBlankWorkImage()]);
  };

  const buttonLabel = hasWork ? 'Check my work' : 'Get a hint';
  const buttonDisabled = workLoading || processingUpload;
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
          onClick={openWhiteboard}
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

  // The hint pinned to the BOTTOM of the scratch-paper overlay. Rendered exactly
  // like the modal (reusing AiTutorMessage / the same fallback note) so styling +
  // LaTeX stay consistent. Null while there's nothing to show, so the overlay only
  // mounts the bottom panel once a check is in flight or has returned.
  const whiteboardHint =
    workLoading || workResult ? (
      <AiTutorMessage
        loading={workLoading}
        result={workResult ? { message: workResult.message } : null}
        tone="hint"
      />
    ) : workError ? (
      <p className="work-review-fallback" role="note">
        I couldn’t review your work right now. Give it another try, or work through it one step at a
        time.
      </p>
    ) : null;

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
        onClose={closeWhiteboard}
        onChange={handleWhiteboardChange}
        onSubmit={handleWhiteboardSubmit}
        problem={prompt}
        hint={whiteboardHint}
        submitDisabled={workLoading}
      />
    </>
  );
}
