import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameLeaderboard } from './GameLeaderboard';
import { useGameLeaderboard, type UseGameLeaderboardResult } from './useGameLeaderboard';

// The component is a thin view over the cloud hook, so the hook is mocked and
// each state (loading / error / ranked / signed-out / offline) is exercised
// directly (mirrors LeaderboardPage.test.tsx).
vi.mock('./useGameLeaderboard', () => ({ useGameLeaderboard: vi.fn() }));

const mockedUseGameLeaderboard = vi.mocked(useGameLeaderboard);

function gameBoard(overrides: Partial<UseGameLeaderboardResult> = {}): UseGameLeaderboardResult {
  return {
    status: 'ready',
    entries: [],
    currentUserRank: null,
    currentUserOutsideTop: null,
    topN: 10,
    signedIn: true,
    available: true,
    localBest: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockedUseGameLeaderboard.mockReset();
});

describe('GameLeaderboard', () => {
  it('renders the global ranked board and highlights the current user', () => {
    mockedUseGameLeaderboard.mockReturnValue(
      gameBoard({
        currentUserRank: 2,
        entries: [
          { id: 'alpha', displayName: 'Alpha', xp: 300, rank: 1, isCurrentUser: false },
          { id: 'me', displayName: 'Maya', xp: 250, rank: 2, isCurrentUser: true },
        ],
      }),
    );

    render(<GameLeaderboard gameId="snake" currentScore={250} />);

    expect(screen.getByRole('heading', { name: 'Global high scores' })).toBeInTheDocument();

    const list = screen.getByRole('list', { name: /top scores for this game/i });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Alpha');
    expect(rows[0]).toHaveTextContent('300');

    const ownRow = within(list).getByText('Maya').closest('li') as HTMLElement;
    expect(ownRow).toHaveAttribute('aria-current', 'true');
    expect(within(ownRow).getByText('You')).toBeInTheDocument();
  });

  it('shows a loading state while the board loads', () => {
    mockedUseGameLeaderboard.mockReturnValue(gameBoard({ status: 'loading' }));

    render(<GameLeaderboard gameId="snake" />);

    expect(screen.getByRole('status', { name: 'Loading high scores' })).toBeInTheDocument();
  });

  it('surfaces an offline/error state', () => {
    mockedUseGameLeaderboard.mockReturnValue(gameBoard({ status: 'error' }));

    render(<GameLeaderboard gameId="snake" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load the global high scores/i);
  });

  it('prompts a signed-out player to sign in and shows their local best', () => {
    mockedUseGameLeaderboard.mockReturnValue(
      gameBoard({ signedIn: false, localBest: 42 }),
    );

    render(<GameLeaderboard gameId="snake" />);

    expect(screen.getByText(/sign in to compete/i)).toBeInTheDocument();
    expect(screen.getByText(/Your best on this device: 42\./i)).toBeInTheDocument();
    // No ranked list is shown when signed out.
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows an offline note when Firestore is unconfigured', () => {
    mockedUseGameLeaderboard.mockReturnValue(gameBoard({ available: false, localBest: null }));

    render(<GameLeaderboard gameId="snake" />);

    expect(screen.getByText(/global leaderboard is offline/i)).toBeInTheDocument();
  });
});
