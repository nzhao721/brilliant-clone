import { act, render, renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { AppLayout } from '../components/AppLayout';
import { coinsSpentStorageKey, useCurrency } from '../games/useCurrency';
import { lessonProgressStorageKey, useLessonProgress } from '../lessons/lessonProgress';
import { AnalyticsPage } from './AnalyticsPage';
import { GamesPage } from './GamesPage';

// Real currency + progress hooks (the single source of truth under test). Only
// the heavy, unrelated dependencies are stubbed: auth identity, the audio
// provider used by the header's SoundControl, and the games registry/shell (so
// this test never pulls in the per-game components or audio assets).
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }));

vi.mock('../data/lessons', () => ({
  lessons: [],
  getLessonById: () => undefined,
  getChapterLessons: () => [],
  getChapterForLesson: () => undefined,
}));

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

vi.mock('../games', () => ({
  games: [],
  readArcadeHighScore: () => 0,
  resetGameHighScores: vi.fn(),
}));

vi.mock('../games/GameShell', () => ({ GameShell: () => null }));

const mockedUseAuth = vi.mocked(useAuth);

function signIn() {
  mockedUseAuth.mockReturnValue({
    user: { uid: 'u1', displayName: 'Maya', email: 'maya@example.com' } as ReturnType<
      typeof useAuth
    >['user'],
    loading: false,
    isConfigured: true,
    loginWithGoogle: vi.fn(),
    loginWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    logout: vi.fn(),
    updateDisplayName: vi.fn(),
    deleteAccount: vi.fn(),
  });
}

// The three coin numbers as the user would read them, one per surface.
function headerCoins(): string {
  return (document.querySelector('.hs-coin .hs-chip-value') as HTMLElement).textContent ?? '';
}

function analyticsCoins(): string {
  // The coin card is the first .analytics-currency-card (XP card is second).
  const card = document.querySelector('.analytics-currency-card') as HTMLElement;
  return (card.querySelector('.stat-card-value') as HTMLElement).textContent ?? '';
}

function gamesCoins(): string {
  return (document.querySelector('.arcade-balance-value') as HTMLElement).textContent ?? '';
}

function renderAllThreeSurfaces() {
  return render(
    <MemoryRouter initialEntries={['/all']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            path="/all"
            element={
              <>
                <AnalyticsPage />
                <GamesPage />
              </>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('coin balance is consistent across header, Analytics, and Games', () => {
  beforeEach(() => {
    window.localStorage.clear();
    signIn();
  });

  it('shows the same spendable balance on all three surfaces', () => {
    // 100 lifetime coins earned, 30 spent in the arcade → spendable balance 70.
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({ completedLessonIds: [], dailyCompletionDates: [], totalXp: 250, totalCoinsEarned: 100 }),
    );
    window.localStorage.setItem(coinsSpentStorageKey, '30');

    renderAllThreeSurfaces();

    expect(headerCoins()).toBe('70');
    expect(analyticsCoins()).toBe('70');
    expect(gamesCoins()).toBe('70');
  });

  it('keeps all three surfaces in sync after the balance changes live', () => {
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({ completedLessonIds: [], dailyCompletionDates: [], totalXp: 250, totalCoinsEarned: 100 }),
    );
    window.localStorage.setItem(coinsSpentStorageKey, '30');

    renderAllThreeSurfaces();

    expect(headerCoins()).toBe('70');
    expect(analyticsCoins()).toBe('70');
    expect(gamesCoins()).toBe('70');

    // Grant coins through the legitimate API (the path the Slipstream race uses
    // for collected pickups) from a separate hook instance; every already-
    // mounted surface must reflect the new balance without a remount.
    const granter = renderHook(() => useCurrency());
    act(() => {
      granter.result.current.addCoins(780);
    });

    expect(headerCoins()).toBe('850');
    expect(analyticsCoins()).toBe('850');
    expect(gamesCoins()).toBe('850');
  });

  // Guards the most plausible real-world divergence: the header HUD is mounted
  // once for the whole app session, so if a coin-earning path failed to notify
  // the shared progress store, the long-lived header would drift from a freshly
  // rendered page. Here a lesson earner, a header-style observer, and a page-style
  // observer are three separate useCurrency()/useLessonProgress() instances that
  // all read the SAME canonical balance; earning must update every one of them.
  it('keeps every consumer in sync when coins are earned, with no remount', () => {
    const earner = renderHook(() => useLessonProgress([], null));
    const header = renderHook(() => useCurrency());
    const page = renderHook(() => useCurrency());

    expect(header.result.current.coinBalance).toBe(0);
    expect(page.result.current.coinBalance).toBe(0);

    // One correct practice answer earns a flat coinsPerCorrectAnswer (5).
    act(() => {
      earner.result.current.awardPracticeQuestion(true);
    });

    expect(earner.result.current.progress.totalCoinsEarned).toBe(5);
    // Both already-mounted observers reflect the new balance from the one source.
    expect(header.result.current.coinBalance).toBe(5);
    expect(page.result.current.coinBalance).toBe(5);
    // A consumer mounted AFTER the change reads the same value too.
    const lateMount = renderHook(() => useCurrency());
    expect(lateMount.result.current.coinBalance).toBe(5);
  });
});
