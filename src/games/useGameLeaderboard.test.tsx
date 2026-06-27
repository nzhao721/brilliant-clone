import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameLeaderboard } from './useGameLeaderboard';
import type { LeaderboardEntry } from '../leaderboard/leaderboardData';

// Auth, Firebase `db`, and the score data layer are mocked so the hook's
// ranking/merge runs without a network (mirrors useClassLeaderboard.test.tsx).
// The pure ranking (buildCloudLeaderboard) runs for real.
type ViewerUser = { uid: string; displayName: string | null; email: string | null };
const viewer: { user: ViewerUser | null } = { user: null };

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  subscribeGameLeaderboard: vi.fn(),
  readGameBest: vi.fn(),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: viewer.user }),
}));

vi.mock('../lib/firebase', () => ({
  get db() {
    return mocks.db;
  },
  auth: null,
}));

vi.mock('./gameScores', () => ({
  gameLeaderboardFetchLimit: 50,
  gameLeaderboardTopN: 10,
  subscribeGameLeaderboard: mocks.subscribeGameLeaderboard,
  readGameBest: mocks.readGameBest,
}));

beforeEach(() => {
  viewer.user = null;
  mocks.db = null;
  mocks.subscribeGameLeaderboard.mockReset();
  mocks.subscribeGameLeaderboard.mockReturnValue(() => {});
  mocks.readGameBest.mockReset();
  mocks.readGameBest.mockReturnValue(null);
});

describe('useGameLeaderboard availability', () => {
  it('is unavailable (no subscribe) when Firebase is not configured', () => {
    mocks.db = null;
    viewer.user = { uid: 'me', displayName: 'Maya', email: 'maya@example.com' };
    mocks.readGameBest.mockReturnValue(120);

    const { result } = renderHook(() => useGameLeaderboard('snake'));

    expect(result.current.available).toBe(false);
    expect(result.current.localBest).toBe(120);
    expect(mocks.subscribeGameLeaderboard).not.toHaveBeenCalled();
  });

  it('is signed-out (no subscribe) when there is no user', () => {
    mocks.db = { name: 'db' };
    viewer.user = null;

    const { result } = renderHook(() => useGameLeaderboard('snake'));

    expect(result.current.available).toBe(true);
    expect(result.current.signedIn).toBe(false);
    expect(mocks.subscribeGameLeaderboard).not.toHaveBeenCalled();
  });
});

describe('useGameLeaderboard cloud board', () => {
  beforeEach(() => {
    mocks.db = { name: 'db' };
    viewer.user = { uid: 'me', displayName: 'Maya', email: 'maya@example.com' };
  });

  it('ranks real rows by score, merging the viewer’s live best', async () => {
    const members: LeaderboardEntry[] = [
      { id: 'alpha', displayName: 'Alpha', xp: 300 },
      { id: 'bravo', displayName: 'Bravo', xp: 200 },
    ];
    mocks.subscribeGameLeaderboard.mockImplementation((_db, _gameId, _topN, onEntries) => {
      onEntries(members);
      return () => {};
    });

    const { result } = renderHook(() => useGameLeaderboard('snake', 250));

    await waitFor(() => expect(result.current.entries).toHaveLength(3));

    // Full order: Alpha(300), Maya(250 live run), Bravo(200).
    expect(result.current.entries.map((entry) => entry.displayName)).toEqual([
      'Alpha',
      'Maya',
      'Bravo',
    ]);
    expect(result.current.currentUserRank).toBe(2);
    expect(result.current.entries[1]).toMatchObject({ isCurrentUser: true, xp: 250 });
    expect(result.current.signedIn).toBe(true);
    expect(mocks.subscribeGameLeaderboard).toHaveBeenCalledWith(
      mocks.db,
      'snake',
      50,
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('prefers the larger of the local best and the current run for the viewer row', async () => {
    mocks.readGameBest.mockReturnValue(900);
    mocks.subscribeGameLeaderboard.mockImplementation((_db, _gameId, _topN, onEntries) => {
      onEntries([{ id: 'alpha', displayName: 'Alpha', xp: 500 }]);
      return () => {};
    });

    const { result } = renderHook(() => useGameLeaderboard('snake', 100));

    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    // Local best 900 beats both Alpha(500) and the current run(100).
    expect(result.current.entries[0]).toMatchObject({ isCurrentUser: true, xp: 900, rank: 1 });
  });

  it('reports an error when the listener fails', async () => {
    mocks.subscribeGameLeaderboard.mockImplementation((_db, _gameId, _topN, _onEntries, onError) => {
      onError();
      return () => {};
    });

    const { result } = renderHook(() => useGameLeaderboard('snake'));

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('stays loading until the first snapshot arrives', () => {
    mocks.subscribeGameLeaderboard.mockReturnValue(() => {});

    const { result } = renderHook(() => useGameLeaderboard('snake'));

    expect(result.current.status).toBe('loading');
  });
});
