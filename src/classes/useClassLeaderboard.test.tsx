import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useClassLeaderboard } from './useClassLeaderboard';
import type { ClassRecord } from './classData';
import type { LeaderboardEntry } from '../leaderboard/leaderboardData';

// Auth, progress, Firebase `db`, the class subscription, and the member-profile
// fetch are mocked so the hook's ranking/merge can be exercised without a
// network. The pure ranking (buildCloudLeaderboard) runs for real.
type ViewerUser = { uid: string; displayName: string | null; email: string | null };
const viewer: { user: ViewerUser | null } = { user: null };
const local = { totalXp: 0 };

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  subscribeClass: vi.fn(),
  getLeaderboardEntriesByIds: vi.fn(),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: viewer.user }),
}));

vi.mock('../data/lessons', () => ({ lessons: [] }));

vi.mock('../lessons/lessonProgress', () => ({
  useLessonProgress: () => ({ progress: { totalXp: local.totalXp } }),
}));

vi.mock('../lib/firebase', () => ({
  get db() {
    return mocks.db;
  },
  auth: null,
}));

vi.mock('../leaderboard/leaderboardFirestore', () => ({
  getLeaderboardEntriesByIds: mocks.getLeaderboardEntriesByIds,
}));

vi.mock('./classData', () => ({
  MAX_CLASS_MEMBERS: 200,
  subscribeClass: mocks.subscribeClass,
}));

function makeRecord(overrides: Partial<ClassRecord> = {}): ClassRecord {
  return {
    code: 'TEAMX9',
    name: 'Team X',
    ownerUid: 'owner',
    memberUids: ['me', 'alpha', 'bravo'],
    memberCount: 3,
    createdAtMillis: null,
    ...overrides,
  };
}

beforeEach(() => {
  viewer.user = null;
  local.totalXp = 0;
  mocks.db = null;
  mocks.subscribeClass.mockReset();
  mocks.subscribeClass.mockReturnValue(() => {});
  mocks.getLeaderboardEntriesByIds.mockReset();
  mocks.getLeaderboardEntriesByIds.mockResolvedValue([]);
});

describe('useClassLeaderboard', () => {
  it('falls back to a viewer-only board when Firebase is unavailable', () => {
    mocks.db = null;
    viewer.user = { uid: 'me', displayName: 'Maya', email: 'maya@example.com' };
    local.totalXp = 120;

    const { result } = renderHook(() => useClassLeaderboard('TEAMX9'));

    expect(result.current.status).toBe('ready');
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({ displayName: 'Maya', isCurrentUser: true });
    expect(mocks.subscribeClass).not.toHaveBeenCalled();
  });

  it('ranks class members by XP, merging the viewer’s live local XP', async () => {
    mocks.db = { name: 'db' };
    viewer.user = { uid: 'me', displayName: 'Maya', email: 'maya@example.com' };
    local.totalXp = 250;

    mocks.subscribeClass.mockImplementation((_db, _code, onClass) => {
      onClass(makeRecord());
      return () => {};
    });
    const members: LeaderboardEntry[] = [
      { id: 'alpha', displayName: 'Alpha', xp: 300 },
      { id: 'bravo', displayName: 'Bravo', xp: 200 },
    ];
    mocks.getLeaderboardEntriesByIds.mockResolvedValue(members);

    const { result } = renderHook(() => useClassLeaderboard('TEAMX9'));

    await waitFor(() => expect(result.current.entries).toHaveLength(3));

    // Full order: Alpha(300), Maya(250 live), Bravo(200).
    expect(result.current.entries.map((entry) => entry.displayName)).toEqual([
      'Alpha',
      'Maya',
      'Bravo',
    ]);
    expect(result.current.currentUserRank).toBe(2);
    expect(result.current.entries[1]).toMatchObject({ isCurrentUser: true, xp: 250 });
    expect(mocks.getLeaderboardEntriesByIds).toHaveBeenCalledWith(mocks.db, [
      'me',
      'alpha',
      'bravo',
    ]);
  });

  it('reports an error when the class subscription fails', async () => {
    mocks.db = { name: 'db' };
    viewer.user = { uid: 'me', displayName: 'Maya', email: 'maya@example.com' };
    mocks.subscribeClass.mockImplementation((_db, _code, _onClass, onError) => {
      onError();
      return () => {};
    });

    const { result } = renderHook(() => useClassLeaderboard('TEAMX9'));

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('stays in loading until the first class snapshot arrives', () => {
    mocks.db = { name: 'db' };
    viewer.user = { uid: 'me', displayName: 'Maya', email: 'maya@example.com' };
    // subscribeClass never invokes the callback → record stays undefined.
    mocks.subscribeClass.mockReturnValue(() => {});

    const { result } = renderHook(() => useClassLeaderboard('TEAMX9'));

    expect(result.current.status).toBe('loading');
  });
});
