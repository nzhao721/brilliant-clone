import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readArcadeHighScore } from '../games';
import { useCurrency, type UseCurrencyResult } from '../games/useCurrency';
import { getTodayKey, lessonProgressStorageKey } from '../lessons/lessonProgress';
import { GamesPage } from './GamesPage';

/* Registry + currency hook mocked so the page logic runs without the game components. One per-second (Flappy) + one fixed (Reaction) cover both billing modes. */
vi.mock('../games', () => ({
  games: [
    {
      id: 'flappy-bird',
      name: 'Flappy',
      description: 'Flap through the gaps.',
      billing: { mode: 'per-second', coinsPerSecond: 2 },
      Component: () => null,
    },
    {
      id: 'reaction-trainer',
      name: 'Reaction',
      description: 'Tap targets fast.',
      billing: { mode: 'fixed', coinCost: 30, durationSeconds: 30 },
      Component: () => null,
    },
  ],
  readArcadeHighScore: vi.fn(),
}));

vi.mock('../games/useCurrency', () => ({
  useCurrency: vi.fn(),
}));

// Stand-in for the game route so a card's navigation can be asserted by URL.
function GameRouteProbe() {
  const { gameId } = useParams();
  return <div>Game route: {gameId}</div>;
}

const mockedUseCurrency = vi.mocked(useCurrency);
const mockedReadHighScore = vi.mocked(readArcadeHighScore);

function currencyState(overrides: Partial<UseCurrencyResult> = {}): UseCurrencyResult {
  const coinBalance = overrides.coinBalance ?? 100;
  return {
    xp: 100,
    coinsEarned: 100,
    coinsGranted: 0,
    coinBalance,
    coinsSpent: 0,
    spendCoins: vi.fn(() => true),
    addCoins: vi.fn(),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <GamesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Real useLessonProgress reads localStorage; clear it so the daily gate is
  // inactive by default (no completed lessons → not gated) unless a test opts in.
  window.localStorage.clear();
  mockedUseCurrency.mockReset();
  mockedReadHighScore.mockReset();
  mockedReadHighScore.mockReturnValue(0);
});

describe('GamesPage', () => {
  it('renders the arcade heading', () => {
    mockedUseCurrency.mockReturnValue(currencyState());

    renderPage();

    expect(screen.getByRole('heading', { name: 'Arcade' })).toBeInTheDocument();
  });

  it('shows ONLY the spendable coin balance (no XP in the arcade)', () => {
    mockedUseCurrency.mockReturnValue(currencyState({ coinBalance: 4500 }));

    renderPage();

    const balance = screen.getByRole('group', { name: 'Your coin balance' });
    expect(within(balance).getByText('Coin balance')).toBeInTheDocument();
    expect(within(balance).getByText('4,500')).toBeInTheDocument();
    // The arcade never surfaces the XP currency token anywhere on the page.
    expect(screen.queryByText(/\bXP\b/)).not.toBeInTheDocument();
  });

  it('renders a card per game with per-second and fixed coin costs', () => {
    mockedUseCurrency.mockReturnValue(currencyState({ coinBalance: 100 }));
    mockedReadHighScore.mockImplementation((id) => (id === 'flappy-bird' ? 1200 : 0));

    renderPage();

    const list = screen.getByRole('list', { name: 'Arcade games' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(2);

    expect(screen.getByRole('heading', { name: 'Flappy' })).toBeInTheDocument();
    expect(screen.getByText('Flap through the gaps.')).toBeInTheDocument();
    // Single combined cost label per billing mode (metered vs. timed).
    expect(screen.getByText('2 coins per second')).toBeInTheDocument();
    expect(screen.getByText('30 coins for 30 seconds')).toBeInTheDocument();
    // High score is formatted; an unplayed game shows an em dash.
    expect(screen.getByText('1,200')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('disables Play for games the player cannot afford to start', () => {
    // 5 coins: enough for one second of Flappy (2/sec), not the 30-coin Reaction.
    mockedUseCurrency.mockReturnValue(currencyState({ coinBalance: 5 }));

    renderPage();

    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Need 30 coins' })).toBeDisabled();
  });

  it('labels a fixed game with its upfront coin cost', () => {
    mockedUseCurrency.mockReturnValue(currencyState({ coinBalance: 100 }));

    renderPage();

    // Per-second game: bare "Play"; fixed game: "Play · 30 coins".
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Play · 30 coins' })).toBeEnabled();
  });

  it('renders the arcade but DISABLES every play button (labeled to unlock) while the daily gate is active', () => {
    // Affordable balance so the only reason the buttons are disabled is the gate.
    mockedUseCurrency.mockReturnValue(currencyState({ coinBalance: 1000 }));
    // A completed lesson with today's required practice UNPASSED → gate active.
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({
        completedLessonIds: ['any-lesson'],
        dailyCompletionDates: [],
        requiredPracticePassedDates: [],
        totalXp: 0,
      }),
    );

    renderPage();

    // NEW MODEL: the arcade still RENDERS (not redirected) with the shared
    // daily-gate banner + its CTA into the required practice.
    expect(screen.getByRole('heading', { name: 'Arcade' })).toBeInTheDocument();
    expect(screen.getByText('Daily practice required')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start required practice' })).toHaveAttribute(
      'href',
      '/practice',
    );

    // Every game's play button is GRAYED OUT / disabled and labeled to unlock.
    const lockedPlayButtons = screen.getAllByRole('button', {
      name: 'Complete daily practice to unlock',
    });
    expect(lockedPlayButtons).toHaveLength(2);
    for (const button of lockedPlayButtons) {
      expect(button).toBeDisabled();
    }
    // The affordable "Play" labels are gone while gated.
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
  });

  it('re-enables the play buttons once today\u2019s required practice is passed', () => {
    mockedUseCurrency.mockReturnValue(currencyState({ coinBalance: 1000 }));
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({
        completedLessonIds: ['any-lesson'],
        dailyCompletionDates: [],
        requiredPracticePassedDates: [getTodayKey()],
        totalXp: 0,
      }),
    );

    renderPage();

    // Gate passed → no lock labels, and the normal Play buttons are back/enabled.
    expect(
      screen.queryByRole('button', { name: 'Complete daily practice to unlock' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
  });

  it("navigates to the chosen game's own route when Play is clicked", async () => {
    const user = userEvent.setup();
    mockedUseCurrency.mockReturnValue(currencyState({ coinBalance: 100 }));

    render(
      <MemoryRouter initialEntries={['/games']}>
        <Routes>
          <Route path="/games" element={<GamesPage />} />
          <Route path="/games/:gameId" element={<GameRouteProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    // The grid is shown on the arcade homepage; no game is mounted inline.
    expect(screen.getByRole('list', { name: 'Arcade games' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Play' }));

    // Clicking Play deep-links to that game's URL rather than toggling state.
    expect(screen.getByText('Game route: flappy-bird')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Arcade games' })).not.toBeInTheDocument();
  });
});
