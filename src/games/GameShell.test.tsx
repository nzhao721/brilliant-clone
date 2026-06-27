import type { ReactElement } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDefinition, GameProps } from './index';
import { useCurrency, type UseCurrencyResult } from './useCurrency';
import { recordGameScore, recordLocalGameBest } from './gameScores';
import { GameShell } from './GameShell';

// Isolate the shell from the real registry (which imports every game component)
// and from the real currency hook, so billing logic can be exercised directly.
vi.mock('./index', () => ({
  readArcadeHighScore: vi.fn(() => 0),
  saveArcadeHighScore: vi.fn((_id: string, score: number) => score),
}));

vi.mock('./useCurrency', () => ({
  useCurrency: vi.fn(),
}));

// The shell fires shared arcade cues via useSound(); stub it with a STABLE
// object so the destructured playEffect keeps a constant identity (the shell's
// timer effects depend on callbacks that include it). Audio is a no-op in jsdom.
const soundApiMock = vi.hoisted(() => ({
  playEffect: vi.fn(),
  playCustom: vi.fn(),
  startMusic: vi.fn(),
  stopMusic: vi.fn(),
  isMuted: false,
  toggleMute: vi.fn(),
  volume: 1,
  setVolume: vi.fn(),
}));
vi.mock('../audio/SoundProvider', () => ({
  useSound: () => soundApiMock,
}));

// The score data layer + leaderboard component are stubbed so the shell test
// stays isolated and can assert how the shell records a finished run (local best
// always; cloud best when signed in) and shows the board.
vi.mock('./gameScores', () => ({
  // Cloud upsert returns a Promise in production; resolve so the shell's
  // best-effort `.catch(...)` has something to chain.
  recordGameScore: vi.fn(() => Promise.resolve()),
  recordLocalGameBest: vi.fn(),
}));

vi.mock('./GameLeaderboard', () => ({
  GameLeaderboard: ({ gameId, currentScore }: { gameId: string; currentScore?: number }) => (
    <div data-testid="game-leaderboard">
      Leaderboard {gameId} {currentScore}
    </div>
  ),
}));

// Signed-in user + configured Firestore so the shell records to the cloud board.
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'u1', displayName: 'Maya', email: 'maya@example.com' } }),
}));

vi.mock('../lib/firebase', () => ({ db: { name: 'mock-db' } }));

const mockedUseCurrency = vi.mocked(useCurrency);
const mockedRecordGameScore = vi.mocked(recordGameScore);
const mockedRecordLocalGameBest = vi.mocked(recordLocalGameBest);

function currency(overrides: Partial<UseCurrencyResult> = {}): UseCurrencyResult {
  return {
    xp: 0,
    coinsEarned: 0,
    coinsGranted: 0,
    coinBalance: 100,
    coinsSpent: 0,
    spendCoins: vi.fn(() => true),
    addCoins: vi.fn(),
    ...overrides,
  };
}

// The shell renders a react-router <Link> on the out-of-coins game-over screen,
// so every render needs a router in context. Using the `wrapper` option means
// the returned `rerender` re-applies it automatically too.
function renderShell(ui: ReactElement) {
  return render(ui, { wrapper: MemoryRouter });
}

function Dummy({ active, onScoreChange, onGameOver }: GameProps) {
  return (
    <div data-testid="dummy">
      <span>{active ? 'on' : 'off'}</span>
      <button type="button" onClick={() => onScoreChange(7)}>
        score
      </button>
      <button type="button" onClick={onGameOver}>
        lose
      </button>
    </div>
  );
}

const perSecondGame: GameDefinition = {
  id: 'test-ps',
  name: 'Endless',
  description: 'An endless test game.',
  billing: { mode: 'per-second', coinsPerSecond: 2 },
  Component: Dummy,
};

const fixedGame: GameDefinition = {
  id: 'test-fixed',
  name: 'Reflex',
  description: 'A fixed-length test game.',
  billing: { mode: 'fixed', coinCost: 30, durationSeconds: 30 },
  Component: Dummy,
};

// One-unit billing on each axis, to exercise singular coin/second wording.
const oneCoinPerSecondGame: GameDefinition = {
  id: 'test-1ps',
  name: 'Penny',
  description: 'A one-coin-per-second test game.',
  billing: { mode: 'per-second', coinsPerSecond: 1 },
  Component: Dummy,
};

const oneSecondFixedGame: GameDefinition = {
  id: 'test-1s',
  name: 'Blink',
  description: 'A one-coin one-second test game.',
  billing: { mode: 'fixed', coinCost: 1, durationSeconds: 1 },
  Component: Dummy,
};

beforeEach(() => {
  window.localStorage.clear();
  mockedUseCurrency.mockReset();
  mockedRecordGameScore.mockClear();
  mockedRecordLocalGameBest.mockClear();
});

describe('GameShell billing', () => {
  it('charges the upfront coin cost when a fixed game starts', async () => {
    const spendCoins = vi.fn(() => true);
    mockedUseCurrency.mockReturnValue(currency({ coinBalance: 100, spendCoins }));
    const user = userEvent.setup();

    renderShell(<GameShell game={fixedGame} />);

    // Fixed games advertise their upfront price.
    const playButton = screen.getByRole('button', { name: 'Play · 30 coins' });
    await user.click(playButton);

    expect(spendCoins).toHaveBeenCalledWith(30);
    expect(spendCoins).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('dummy')).toHaveTextContent('on');
  });

  it('disables play for a fixed game the player cannot afford', () => {
    mockedUseCurrency.mockReturnValue(currency({ coinBalance: 10 }));

    renderShell(<GameShell game={fixedGame} />);

    expect(screen.getByRole('button', { name: 'Need 30 coins' })).toBeDisabled();
  });

  it('bills a per-second game one coin at a time and ends when the next coin is unaffordable', () => {
    vi.useFakeTimers();
    try {
      let coinsSpent = 0;
      // Affords exactly three single-coin ticks, then the fourth can't be paid.
      const spendCoins = vi.fn((amount: number) => {
        coinsSpent += amount;
        return coinsSpent <= 3;
      });
      mockedUseCurrency.mockReturnValue(currency({ coinBalance: 100, spendCoins }));

      // perSecondGame bills 2 coins/sec → one coin deducted every 500ms.
      renderShell(<GameShell game={perSecondGame} />);

      // Per-second games show a bare "Play" (no upfront cost charged on start).
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      });
      expect(spendCoins).not.toHaveBeenCalled();
      expect(screen.getByTestId('dummy')).toHaveTextContent('on');

      // First 500ms tick deducts a SINGLE coin (not the whole per-second rate).
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(spendCoins).toHaveBeenCalledTimes(1);
      expect(spendCoins).toHaveBeenNthCalledWith(1, 1);

      // After a full second (two ticks) two coins are billed and the elapsed
      // readout shows exactly one whole second.
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(spendCoins).toHaveBeenCalledTimes(2);
      expect(screen.getByText('0:01')).toBeInTheDocument();

      // Third tick is still affordable; play continues.
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(spendCoins).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId('dummy')).toHaveTextContent('on');

      // Fourth tick can't be paid → the session ends "Out of coins".
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(spendCoins).toHaveBeenCalledTimes(4);
      expect(spendCoins).toHaveBeenNthCalledWith(4, 1);
      expect(screen.getByText('Out of coins')).toBeInTheDocument();
      expect(screen.getByTestId('dummy')).toHaveTextContent('off');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ends a per-second session when the game reports game over', () => {
    const spendCoins = vi.fn(() => true);
    mockedUseCurrency.mockReturnValue(currency({ coinBalance: 100, spendCoins }));

    renderShell(<GameShell game={perSecondGame} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByTestId('dummy')).toHaveTextContent('on');

    // The game signals a loss via the onGameOver prop the shell supplied.
    fireEvent.click(screen.getByRole('button', { name: 'lose' }));

    expect(screen.getByText('Game over')).toBeInTheDocument();
    expect(screen.getByTestId('dummy')).toHaveTextContent('off');
  });
});

describe('GameShell game-over actions', () => {
  it('offers a Keep learning link to lessons when the run ends out of coins', () => {
    vi.useFakeTimers();
    try {
      // Affords exactly three single-coin ticks, then the balance is spent and
      // the fourth tick can't be charged → the run ends "Out of coins".
      let coinsSpent = 0;
      const spendCoins = vi.fn((amount: number) => {
        coinsSpent += amount;
        return coinsSpent <= 3;
      });
      mockedUseCurrency.mockReturnValue(currency({ coinBalance: 100, spendCoins }));

      // perSecondGame bills 2 coins/sec → one coin every 500ms.
      renderShell(<GameShell game={perSecondGame} />);
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      });

      // Four 500ms ticks; the fourth is unaffordable and ends the session.
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('Out of coins')).toBeInTheDocument();

      // The primary action becomes a router link back to the lessons hub...
      const keepLearning = screen.getByRole('link', { name: 'Keep learning' });
      expect(keepLearning).toHaveAttribute('href', '/dashboard');

      // ...replacing the usual Play again button entirely.
      expect(screen.queryByRole('button', { name: /Play again/ })).not.toBeInTheDocument();

      // Score readout and leaderboard remain intact on the game-over screen.
      expect(screen.getByTestId('game-leaderboard')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the Play again button (and no Keep learning link) on a normal loss', () => {
    const spendCoins = vi.fn(() => true);
    mockedUseCurrency.mockReturnValue(currency({ coinBalance: 100, spendCoins }));

    renderShell(<GameShell game={perSecondGame} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    // The game reports a loss (not an out-of-coins end).
    fireEvent.click(screen.getByRole('button', { name: 'lose' }));

    expect(screen.getByText('Game over')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Keep learning' })).not.toBeInTheDocument();
  });
});

describe('GameShell combined cost label', () => {
  it('shows a metered game as a single "coins per second" phrase', () => {
    mockedUseCurrency.mockReturnValue(currency({ coinBalance: 100 }));

    renderShell(<GameShell game={perSecondGame} />);

    expect(screen.getByText('2 coins per second')).toBeInTheDocument();
  });

  it('shows a timed game as a single "coins for seconds" phrase', () => {
    mockedUseCurrency.mockReturnValue(currency({ coinBalance: 100 }));

    renderShell(<GameShell game={fixedGame} />);

    expect(screen.getByText('30 coins for 30 seconds')).toBeInTheDocument();
  });

  it('uses singular nouns when the count is one', () => {
    mockedUseCurrency.mockReturnValue(currency({ coinBalance: 100 }));

    const { rerender } = renderShell(<GameShell game={oneCoinPerSecondGame} />);
    expect(screen.getByText('1 coin per second')).toBeInTheDocument();

    rerender(<GameShell game={oneSecondFixedGame} />);
    expect(screen.getByText('1 coin for 1 second')).toBeInTheDocument();
  });

  it('uses singular "coin" on an unaffordable affordance', () => {
    mockedUseCurrency.mockReturnValue(currency({ coinBalance: 0 }));

    renderShell(<GameShell game={oneCoinPerSecondGame} />);

    expect(screen.getByRole('button', { name: 'Need 1 coin' })).toBeDisabled();
  });
});

describe('GameShell leaderboard', () => {
  it('records the finished run once and shows the leaderboard on game over', () => {
    const spendCoins = vi.fn(() => true);
    mockedUseCurrency.mockReturnValue(currency({ coinBalance: 100, spendCoins }));

    const { rerender } = renderShell(<GameShell game={perSecondGame} />);

    // Nothing recorded and no leaderboard while the shell sits idle.
    expect(mockedRecordLocalGameBest).not.toHaveBeenCalled();
    expect(mockedRecordGameScore).not.toHaveBeenCalled();
    expect(screen.queryByTestId('game-leaderboard')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    // Report a real score mid-run; recording must wait for the session to end.
    fireEvent.click(screen.getByRole('button', { name: 'score' }));
    expect(mockedRecordLocalGameBest).not.toHaveBeenCalled();
    expect(mockedRecordGameScore).not.toHaveBeenCalled();
    expect(screen.queryByTestId('game-leaderboard')).not.toBeInTheDocument();

    // The game signals a loss → the shell ends the session.
    fireEvent.click(screen.getByRole('button', { name: 'lose' }));

    // The run is recorded exactly once: a LOCAL best plus a CLOUD upsert (signed
    // in), each with the game id + final score.
    expect(mockedRecordLocalGameBest).toHaveBeenCalledTimes(1);
    expect(mockedRecordLocalGameBest).toHaveBeenCalledWith('test-ps', 7);
    expect(mockedRecordGameScore).toHaveBeenCalledTimes(1);
    expect(mockedRecordGameScore).toHaveBeenCalledWith({ name: 'mock-db' }, 'test-ps', {
      uid: 'u1',
      displayName: 'Maya',
      score: 7,
    });

    // The ranked list renders on the game-over panel, fed the final score.
    const board = screen.getByTestId('game-leaderboard');
    expect(board).toHaveTextContent('test-ps');
    expect(board).toHaveTextContent('7');

    // A re-render of the game-over panel must NOT re-record the same run.
    rerender(<GameShell game={perSecondGame} />);
    expect(mockedRecordLocalGameBest).toHaveBeenCalledTimes(1);
    expect(mockedRecordGameScore).toHaveBeenCalledTimes(1);
  });

  it('records a run once when a fixed game runs out of time', () => {
    vi.useFakeTimers();
    try {
      const spendCoins = vi.fn(() => true);
      mockedUseCurrency.mockReturnValue(currency({ coinBalance: 100, spendCoins }));

      renderShell(<GameShell game={oneSecondFixedGame} />);

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Play · 1 coin' }));
      });

      // Drive the 1-second countdown to zero → the session ends on "Time's up".
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByText("Time's up")).toBeInTheDocument();
      expect(mockedRecordLocalGameBest).toHaveBeenCalledTimes(1);
      expect(mockedRecordLocalGameBest).toHaveBeenCalledWith('test-1s', 0);
      expect(mockedRecordGameScore).toHaveBeenCalledTimes(1);
      expect(mockedRecordGameScore).toHaveBeenCalledWith({ name: 'mock-db' }, 'test-1s', {
        uid: 'u1',
        displayName: 'Maya',
        score: 0,
      });
      expect(screen.getByTestId('game-leaderboard')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('GameShell back to arcade', () => {
  it('shows a back-to-arcade link pointing at the arcade homepage', () => {
    mockedUseCurrency.mockReturnValue(currency({ coinBalance: 100 }));

    renderShell(<GameShell game={perSecondGame} />);

    expect(screen.getByRole('link', { name: /back to arcade/i })).toHaveAttribute('href', '/games');
  });

  it('returns to the arcade homepage when the back link is clicked', async () => {
    const user = userEvent.setup();
    mockedUseCurrency.mockReturnValue(currency({ coinBalance: 100 }));

    render(
      <MemoryRouter initialEntries={['/games/test-ps']}>
        <Routes>
          <Route path="/games" element={<div>Arcade home</div>} />
          <Route path="/games/:gameId" element={<GameShell game={perSecondGame} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Arcade home')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /back to arcade/i }));

    expect(screen.getByText('Arcade home')).toBeInTheDocument();
  });
});

describe('GameShell page-scroll guard', () => {
  // fireEvent returns the dispatchEvent result: false when a listener called
  // preventDefault on a cancelable event, true otherwise. So `false` here means
  // "the page would NOT scroll".
  it('cancels scroll keys only while a session is actively playing', () => {
    mockedUseCurrency.mockReturnValue(currency({ coinBalance: 100, spendCoins: vi.fn(() => true) }));

    renderShell(<GameShell game={perSecondGame} />);

    // Idle (Play not pressed yet): keys scroll the page as normal.
    expect(fireEvent.keyDown(window, { key: 'ArrowDown' })).toBe(true);
    expect(fireEvent.keyDown(window, { key: ' ' })).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByTestId('dummy')).toHaveTextContent('on');

    // Playing: the shared scroll keys are cancelled regardless of focus.
    expect(fireEvent.keyDown(window, { key: 'ArrowDown' })).toBe(false);
    expect(fireEvent.keyDown(window, { key: 'ArrowUp' })).toBe(false);
    expect(fireEvent.keyDown(window, { key: ' ' })).toBe(false);
    expect(fireEvent.keyDown(window, { key: 'PageDown' })).toBe(false);

    // Non-scroll keys are never touched.
    expect(fireEvent.keyDown(window, { key: 'a' })).toBe(true);

    // Space on a real focused button/link is left alone so it still activates.
    const sceneButton = screen.getByRole('button', { name: 'score' });
    expect(fireEvent.keyDown(sceneButton, { key: ' ' })).toBe(true);

    // Game over: the guard is disarmed, so the page scrolls normally again.
    fireEvent.click(screen.getByRole('button', { name: 'lose' }));
    expect(screen.getByText('Game over')).toBeInTheDocument();
    expect(fireEvent.keyDown(window, { key: 'ArrowDown' })).toBe(true);
  });
});
