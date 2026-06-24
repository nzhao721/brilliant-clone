import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { AppLayout } from './AppLayout';

vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Keep the reset action deterministic and assertable without touching storage.
const resetProgressMock = vi.hoisted(() => vi.fn());
const clearLocalLessonProgressMock = vi.hoisted(() => vi.fn());

vi.mock('../lessons/lessonProgress', () => ({
  useLessonProgress: () => ({
    resetProgress: resetProgressMock,
    currentStreakDays: 0,
    progress: { totalXp: 0 },
  }),
  clearLocalLessonProgress: clearLocalLessonProgressMock,
}));

const mockedUseAuth = vi.mocked(useAuth);

beforeEach(() => {
  resetProgressMock.mockClear();
  clearLocalLessonProgressMock.mockClear();
});

function authState(overrides: Partial<ReturnType<typeof useAuth>> = {}): ReturnType<typeof useAuth> {
  return {
    user: null,
    loading: false,
    isConfigured: true,
    loginWithGoogle: vi.fn(),
    loginWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    logout: vi.fn(),
    deleteAccount: vi.fn(),
    ...overrides,
  };
}

function renderLayout(initialPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<div>Home content</div>} />
          <Route path="/dashboard" element={<div>Dashboard content</div>} />
          <Route path="/login" element={<div>Login content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppLayout', () => {
  it('shows a login link when signed out', () => {
    mockedUseAuth.mockReturnValue(authState({ user: null }));

    renderLayout();

    const brandLink = screen.getByRole('link', { name: 'SlopeWise home' });

    expect(brandLink).toHaveTextContent('SlopeWise');
    expect(brandLink.querySelector('.brand-logo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: 'Practice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  });

  it('shows the first name and reveals logout from the profile menu', async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue(
      authState({
        logout,
        user: { email: 'maya@example.com' } as ReturnType<typeof useAuth>['user'],
      }),
    );

    renderLayout();

    const trigger = screen.getByRole('button', { name: /maya/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menuitem', { name: 'Log out' })).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));

    expect(logout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('Home content')).toBeInTheDocument());
  });

  it('groups destructive actions last: Log out, Reset progress, then Delete account', async () => {
    const user = userEvent.setup();
    mockedUseAuth.mockReturnValue(
      authState({ user: { email: 'maya@example.com' } as ReturnType<typeof useAuth>['user'] }),
    );

    renderLayout();

    await user.click(screen.getByRole('button', { name: /maya/i }));

    const items = screen.getAllByRole('menuitem');

    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items[items.length - 3]).toHaveTextContent('Log out');
    expect(items[items.length - 2]).toHaveTextContent('Reset progress');
    expect(items[items.length - 1]).toHaveTextContent('Delete account');
  });

  it('confirms before resetting progress and then resets', async () => {
    const user = userEvent.setup();
    mockedUseAuth.mockReturnValue(
      authState({ user: { email: 'maya@example.com' } as ReturnType<typeof useAuth>['user'] }),
    );

    renderLayout();

    await user.click(screen.getByRole('button', { name: /maya/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Reset progress' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('Reset your progress?')).toBeInTheDocument();
    expect(resetProgressMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Reset progress' }));

    expect(resetProgressMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not reset progress when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    mockedUseAuth.mockReturnValue(
      authState({ user: { email: 'maya@example.com' } as ReturnType<typeof useAuth>['user'] }),
    );

    renderLayout();

    await user.click(screen.getByRole('button', { name: /maya/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Reset progress' }));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(resetProgressMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('deletes the account after the typed confirmation, then clears local data and navigates home', async () => {
    const user = userEvent.setup();
    const deleteAccount = vi.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue(
      authState({
        deleteAccount,
        user: { email: 'maya@example.com' } as ReturnType<typeof useAuth>['user'],
      }),
    );

    renderLayout();

    await user.click(screen.getByRole('button', { name: /maya/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete account' }));

    const dialog = screen.getByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: 'Delete account' });
    expect(confirmButton).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/type delete to confirm/i), 'DELETE');
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(clearLocalLessonProgressMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('Home content')).toBeInTheDocument());
  });

  it('does not delete the account when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    const deleteAccount = vi.fn();
    mockedUseAuth.mockReturnValue(
      authState({
        deleteAccount,
        user: { email: 'maya@example.com' } as ReturnType<typeof useAuth>['user'],
      }),
    );

    renderLayout();

    await user.click(screen.getByRole('button', { name: /maya/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete account' }));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(deleteAccount).not.toHaveBeenCalled();
    expect(clearLocalLessonProgressMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the dialog open and shows an error when deletion fails', async () => {
    const user = userEvent.setup();
    const deleteAccount = vi.fn().mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    mockedUseAuth.mockReturnValue(
      authState({
        deleteAccount,
        user: { email: 'maya@example.com' } as ReturnType<typeof useAuth>['user'],
      }),
    );

    renderLayout();

    await user.click(screen.getByRole('button', { name: /maya/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete account' }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/type delete to confirm/i), 'DELETE');
    await user.click(within(dialog).getByRole('button', { name: 'Delete account' }));

    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Sign-in was closed before it finished.',
    );
    expect(clearLocalLessonProgressMock).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
