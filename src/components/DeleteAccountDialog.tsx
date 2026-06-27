import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { getAuthErrorMessage } from '../auth/authErrors';

type DeleteAccountDialogProps = {
  email?: string | null;
  requiresPassword: boolean;
  onCancel: () => void;
  onConfirm: (password?: string) => Promise<void>;
};

const CONFIRM_WORD = 'DELETE';

/**
 * Accessible confirm modal for the irreversible account deletion: requires typing
 * DELETE (plus the password for password accounts) to enable the button. Traps
 * focus, closes on Escape/backdrop, and shows errors inline.
 */
export function DeleteAccountDialog({
  email,
  requiresPassword,
  onCancel,
  onConfirm,
}: DeleteAccountDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const confirmInputId = useId();
  const passwordInputId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    confirmInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isDeleting) {
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

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
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
  }, [isDeleting, onCancel]);

  const canConfirm =
    confirmText === CONFIRM_WORD && (!requiresPassword || password.length > 0) && !isDeleting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canConfirm) {
      return;
    }

    setError('');
    setIsDeleting(true);

    try {
      await onConfirm(requiresPassword ? password : undefined);
      /* On success the parent unmounts this dialog, so leave the busy state to avoid a form flash. */
    } catch (deleteError) {
      setError(getAuthErrorMessage(deleteError));
      setIsDeleting(false);
    }
  }

  return createPortal(
    <div
      className="reset-confirm-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isDeleting) {
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
          Delete your account?
        </h2>
        <p className="reset-confirm-text" id={descriptionId}>
          This permanently deletes{email ? ` ${email}` : ' your account'} along with all your saved
          lessons, XP, and streak. This can&apos;t be undone.
        </p>

        <form className="delete-confirm-form" onSubmit={handleSubmit}>
          <div className="delete-confirm-field">
            <label className="delete-confirm-label" htmlFor={confirmInputId}>
              Type <span className="delete-confirm-word">{CONFIRM_WORD}</span> to confirm
            </label>
            <input
              ref={confirmInputRef}
              id={confirmInputId}
              className="delete-confirm-input"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={confirmText}
              disabled={isDeleting}
              onChange={(event) => setConfirmText(event.target.value)}
            />
          </div>

          {requiresPassword ? (
            <div className="delete-confirm-field">
              <label className="delete-confirm-label" htmlFor={passwordInputId}>
                Current password
              </label>
              <input
                id={passwordInputId}
                className="delete-confirm-input"
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={isDeleting}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          ) : null}

          {error ? (
            <p className="delete-confirm-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="reset-confirm-actions">
            <button
              type="button"
              className="reset-confirm-cancel"
              onClick={onCancel}
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button type="submit" className="reset-confirm-confirm" disabled={!canConfirm}>
              {isDeleting ? 'Deleting…' : 'Delete account'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
