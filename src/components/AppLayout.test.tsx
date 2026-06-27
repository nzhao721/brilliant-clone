import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { AppLayout } from './AppLayout';

vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// The header mounts <SoundControl>, which calls useSound(); stub it so the
// layout renders without a real SoundProvider (audio is a no-op in jsdom).
vi.mock('../audio/SoundProvider', () => ({
  useSound: () => ({
    playEffect: vi.fn(),
    playCustom: vi.fn(),
    startMusic: vi.fn(),
    stopMusic: vi.fn(),
    isMuted: false,
    toggleMute: vi.fn(),
    volume: 1,
    setVolume: vi.fn(),
  }),
}));

// Keep the reset action deterministic and assertable without touching storage.
const resetProgressMock = vi.hoisted(() => vi.fn());
const clearLocalLessonProgressMock = vi.hoisted(() => vi.fn());
// Reset now also clears the coin ledgers and arcade high scores; mock those so
// the test asserts the wiring without depending on the real currency hook or
// the full game registry (which imports every game component).
const resetCoinsMock = vi.hoisted(() => vi.fn());
const resetGameHighScoresMock = vi.hoisted(() => vi.fn());

vi.mock('../lessons/lessonProgress', () => ({
  useLessonProgress: () => ({
    resetProgress: resetProgressMock,
    currentStreakDays: 0,
    progress: { totalXp: 0 },
  }),
  clearLocalLessonProgress: clearLocalLessonProgressMock,
}));

vi.mock('../games/useCurrency', () => ({
  resetCoins: resetCoinsMock,
  useCurrency: () => ({ coinBalance: 0 }),
}));

vi.mock('../games', () => ({
  resetGameHighScores: resetGameHighScoresMock,
}));

const mockedUseAuth = vi.mocked(useAuth);

beforeEach(() => {
  resetProgressMock.mockClear();
  clearLocalLessonProgressMock.mockClear();
  resetCoinsMock.mockClear();
  resetGameHighScoresMock.mockClear();
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
    updateDisplayName: vi.fn(),
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

  it('links to the dashboard, practice hub, analytics, leaderboard, and games from the profile menu', async () => {
    const user = userEvent.setup();
    mockedUseAuth.mockReturnValue(
      authState({ user: { email: 'maya@example.com' } as ReturnType<typeof useAuth>['user'] }),
    );

    renderLayout();

    await user.click(screen.getByRole('button', { name: /maya/i }));

    expect(screen.getByRole('menuitem', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('menuitem', { name: 'Practice' })).toHaveAttribute('href', '/practice');
    expect(screen.getByRole('menuitem', { name: 'Analytics' })).toHaveAttribute('href', '/analytics');
    expect(screen.getByRole('menuitem', { name: 'Leaderboard' })).toHaveAttribute(
      'href',
      '/leaderboard',
    );
    expect(screen.getByRole('menuitem', { name: 'Games' })).toHaveAttribute('href', '/games');
  });

  it('returns to the arcade homepage from the Games menu item, even while inside a game', async () => {
    const user = userEvent.setup();
    mockedUseAuth.mockReturnValue(
      authState({ user: { email: 'maya@example.com' } as ReturnType<typeof useAuth>['user'] }),
    );

    render(
      <MemoryRouter initialEntries={['/games/snake']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/games" element={<div>Arcade homepage</div>} />
            <Route path="/games/:gameId" element={<div>Playing a game</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    // Start deep inside an open game route.
    expect(screen.getByText('Playing a game')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /maya/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Games' }));

    // The Games item always lands on the arcade landing page, leaving the game.
    expect(screen.getByText('Arcade homepage')).toBeInTheDocument();
    expect(screen.queryByText('Playing a game')).not.toBeInTheDocument();
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
    expect(resetCoinsMock).not.toHaveBeenCalled();
    expect(resetGameHighScoresMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Reset progress' }));

    // Confirming clears lesson progress AND the coin ledgers AND arcade bests.
    expect(resetProgressMock).toHaveBeenCalledTimes(1);
    expect(resetCoinsMock).toHaveBeenCalledTimes(1);
    expect(resetGameHighScoresMock).toHaveBeenCalledTimes(1);
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
    expect(resetCoinsMock).not.toHaveBeenCalled();
    expect(resetGameHighScoresMock).not.toHaveBeenCalled();
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
