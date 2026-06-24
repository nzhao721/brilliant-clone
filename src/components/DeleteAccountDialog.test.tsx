import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeleteAccountDialog } from './DeleteAccountDialog';

describe('DeleteAccountDialog', () => {
  it('enables deletion only after typing DELETE and confirms without a password', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <DeleteAccountDialog requiresPassword={false} onCancel={vi.fn()} onConfirm={onConfirm} />,
    );

    const confirm = screen.getByRole('button', { name: 'Delete account' });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/type delete to confirm/i), 'DELETE');
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('requires the current password for password accounts and forwards it', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <DeleteAccountDialog
        requiresPassword
        email="maya@example.com"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const confirm = screen.getByRole('button', { name: 'Delete account' });

    await user.type(screen.getByLabelText(/type delete to confirm/i), 'DELETE');
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText('Current password'), 'sup3rsecret');
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('sup3rsecret');
  });

  it('shows a friendly error and stays open when deletion fails', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue({ code: 'auth/wrong-password' });

    render(<DeleteAccountDialog requiresPassword onCancel={vi.fn()} onConfirm={onConfirm} />);

    await user.type(screen.getByLabelText(/type delete to confirm/i), 'DELETE');
    await user.type(screen.getByLabelText('Current password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('cancels without confirming', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteAccountDialog requiresPassword={false} onCancel={onCancel} onConfirm={onConfirm} />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
