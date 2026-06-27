import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seededCompetitors, type LeaderboardEntry } from './leaderboardData';
import { useLeaderboard } from './useLeaderboard';

// Auth + progress are mocked (mirroring useCurrency.test.ts) so each test pins
// the viewer's identity and live XP. Firebase `db` and the Firestore listener
// are mocked too — via hoisted, per-test-mutable state — so this one file can
// exercise BOTH paths of the hook:
//   • db === null → the local-only seeded fallback (unchanged legacy behavior)
//   • db !== null → the real cloud board, which must contain NO seeded fakes
type ViewerUser = { uid: string; displayName: string | null; email: string | null };
const viewer: { user: ViewerUser | null } = { user: null };
const local = { totalXp: 0 };

const mocks = vi.hoisted(() => ({
  // `null` mimics the test-disabled Firebase (see src/lib/firebase.ts); cloud
  // tests flip this to a truthy stand-in to take the db != null branch.
  db: null as unknown,
  subscribeLeaderboard: vi.fn(),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: viewer.user }),
}));

vi.mock('../data/lessons', () => ({
  lessons: [],
}));

vi.mock('../lessons/lessonProgress', () => ({
  useLessonProgress: () => ({ progress: { totalXp: local.totalXp } }),
}));

// A getter keeps `db` live so each test reads the current hoisted value.
vi.mock('../lib/firebase', () => ({
  get db() {
    return mocks.db;
  },
  auth: null,
}));

vi.mock('./leaderboardFirestore', () => ({
  leaderboardFetchLimit: 50,
  subscribeLeaderboard: mocks.subscribeLeaderboard,
}));

beforeEach(() => {
  viewer.user = null;
  local.totalXp = 0;
  mocks.db = null;
  mocks.subscribeLeaderboard.mockReset();
  mocks.subscribeLeaderboard.mockReturnValue(() => {});
});

describe('useLeaderboard (Firestore-unavailable fallback)', () => {
  it('falls back to the local seeded board when db is null', () => {
    const { result } = renderHook(() => useLeaderboard());

    expect(result.current.status).toBe('ready');
    expect(result.current.topN).toBe(10);
    expect(result.current.entries).toHaveLength(10);
    // The seeded competitors still form the visible board (unchanged behavior).
    expect(result.current.entries[0].displayName).toBe(seededCompetitors[0].displayName);
    // The 0-XP viewer ranks below every seed → pinned beneath the top-10 window.
    expect(result.current.currentUserOutsideTop).toMatchObject({
      displayName: 'You',
      isCurrentUser: true,
    });
    expect(result.current.currentUserRank).toBe(seededCompetitors.length + 1);
  });

  it('ranks the signed-in viewer into the board from their local XP', () => {
    viewer.user = { uid: 'me', displayName: 'Ada Lovelace', email: 'ada@example.com' };
    local.totalXp = 999_999;

    const { result } = renderHook(() => useLeaderboard());

    expect(result.current.status).toBe('ready');
    expect(result.current.entries[0]).toMatchObject({
      displayName: 'Ada Lovelace',
      rank: 1,
      isCurrentUser: true,
    });
    expect(result.current.currentUserRank).toBe(1);
    expect(result.current.currentUserOutsideTop).toBeNull();
    // Even in the fallback the seeded names still backfill the rest of the board.
    expect(result.current.entries.some((entry) => entry.displayName === seededCompetitors[0].displayName)).toBe(
      true,
    );
  });
});

describe('useLeaderboard (Firestore cloud path)', () => {
  const seededNames = new Set(seededCompetitors.map((seed) => seed.displayName));

  // Routes the hook down the db != null branch with the supplied real rows.
  function withCloudEntries(realEntries: LeaderboardEntry[]): void {
    mocks.db = { name: 'mock-db' };
    mocks.subscribeLeaderboard.mockImplementation(
      (_db: unknown, _topN: number, onEntries: (entries: LeaderboardEntry[]) => void) => {
        onEntries(realEntries);
        return () => {};
      },
    );
  }

  it('builds the board from ONLY real Firestore users (no seeded fakes)', () => {
    viewer.user = { uid: 'me', displayName: 'Maya', email: 'maya@example.com' };
    local.totalXp = 250;
    withCloudEntries([
      { id: 'u-alpha', displayName: 'Alpha', xp: 300 },
      { id: 'u-bravo', displayName: 'Bravo', xp: 200 },
      { id: 'u-charlie', displayName: 'Charlie', xp: 100 },
    ]);

    const { result } = renderHook(() => useLeaderboard());

    expect(result.current.status).toBe('ready');
    // Full order: Alpha(300), Maya(250), Bravo(200), Charlie(100).
    expect(result.current.entries.map((entry) => entry.displayName)).toEqual([
      'Alpha',
      'Maya',
      'Bravo',
      'Charlie',
    ]);
    expect(result.current.currentUserRank).toBe(2);
    // None of the fake seeded competitors leak into the deployed board.
    expect(result.current.entries.some((entry) => seededNames.has(entry.displayName))).toBe(false);
  });

  it('shows ONLY the viewer when no other real users exist (no fakes topped up)', () => {
    viewer.user = { uid: 'me', displayName: 'Newcomer', email: 'new@example.com' };
    local.totalXp = 0;
    withCloudEntries([]);

    const { result } = renderHook(() => useLeaderboard());

    expect(result.current.status).toBe('ready');
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({
      displayName: 'Newcomer',
      rank: 1,
      isCurrentUser: true,
    });
    expect(result.current.currentUserRank).toBe(1);
    expect(result.current.currentUserOutsideTop).toBeNull();
    expect(result.current.entries.some((entry) => seededNames.has(entry.displayName))).toBe(false);
  });
});
