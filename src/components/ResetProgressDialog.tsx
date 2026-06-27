import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

type ResetProgressDialogProps = {
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Accessible "Are you sure?" modal for resetting progress: moves focus in on open,
 * traps Tab, closes on Escape/backdrop, and confirms only via the red button.
 */
export function ResetProgressDialog({ onCancel, onConfirm }: ResetProgressDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    /* Focus Cancel so a stray Enter/Space can't confirm on open. */
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return createPortal(
    <div
      className="reset-confirm-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="reset-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 className="reset-confirm-title" id={titleId}>
          Reset your progress?
        </h2>
        <p className="reset-confirm-text" id={descriptionId}>
          This clears your saved lessons, XP, streak, and testing date. This can&apos;t be undone.
        </p>
        <div className="reset-confirm-actions">
          <button ref={cancelRef} type="button" className="reset-confirm-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="reset-confirm-confirm" onClick={onConfirm}>
            Reset progress
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
