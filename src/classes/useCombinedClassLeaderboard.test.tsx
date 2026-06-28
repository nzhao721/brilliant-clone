import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCombinedClassLeaderboard } from './useCombinedClassLeaderboard';
import { computeLeaderboardGapMessage } from '../leaderboard/leaderboardGap';
import type { ClassRecord } from './classData';
import type { LeaderboardEntry } from '../leaderboard/leaderboardData';

// Auth, progress, Firebase `db`, the member-profile fetch, and the `useClasses`
// membership hook are mocked so the union/ranking can be exercised without a
// network. The pure ranking (buildCloudLeaderboard) runs for real.
type ViewerUser = { uid: string; displayName: string | null; email: string | null };
const viewer: { user: ViewerUser | null } = { user: null };
const local = { totalXp: 0 };

type ClassesState = {
  classes: ClassRecord[];
  status: 'loading' | 'ready' | 'unavailable';
  error: boolean;
  available: boolean;
  signedIn: boolean;
};
const classesState: ClassesState = {
  classes: [],
  status: 'unavailable',
  error: false,
  available: false,
  signedIn: false,
};

const mocks = vi.hoisted(() => ({
  db: null as unknown,
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

vi.mock('./classData', () => ({ MAX_CLASS_MEMBERS: 200 }));

vi.mock('./useClasses', () => ({
  useClasses: () => classesState,
}));

function makeClass(code: string, memberUids: string[]): ClassRecord {
  return {
    code,
    name: code,
    ownerUid: memberUids[0] ?? 'owner',
    memberUids,
    memberCount: memberUids.length,
    createdAtMillis: null,
  };
}

/* Puts the hook on the live cloud path: Firebase up, viewer signed in, class list
 * ready. Individual tests then set `classes` + the fetched member rows. */
function signedInCloud(): void {
  mocks.db = { name: 'db' };
  viewer.user = { uid: 'me', displayName: 'Maya', email: 'maya@example.com' };
  classesState.available = true;
  classesState.signedIn = true;
  classesState.status = 'ready';
}

beforeEach(() => {
  viewer.user = null;
  local.totalXp = 0;
  mocks.db = null;
  classesState.classes = [];
  classesState.status = 'unavailable';
  classesState.error = false;
  classesState.available = false;
  classesState.signedIn = false;
  mocks.getLeaderboardEntriesByIds.mockReset();
  mocks.getLeaderboardEntriesByIds.mockResolvedValue([]);
});

describe('useCombinedClassLeaderboard', () => {
  it('unions classmates across all classes (deduped by uid) and ranks the combined set', async () => {
    signedInCloud();
    local.totalXp = 250;
    classesState.classes = [
      makeClass('AAA1', ['me', 'alpha', 'shared']),
      makeClass('BBB2', ['me', 'bravo', 'shared']),
    ];
    const members: LeaderboardEntry[] = [
      { id: 'alpha', displayName: 'Alpha', xp: 300 },
      { id: 'bravo', displayName: 'Bravo', xp: 200 },
      { id: 'shared', displayName: 'Shared', xp: 275 },
    ];
    mocks.getLeaderboardEntriesByIds.mockResolvedValue(members);

    const { result } = renderHook(() => useCombinedClassLeaderboard());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(result.current.entries).toHaveLength(4));

    // Combined order by XP: Alpha(300), Shared(275), Maya(250 live), Bravo(200).
    expect(result.current.entries.map((entry) => entry.displayName)).toEqual([
      'Alpha',
      'Shared',
      'Maya',
      'Bravo',
    ]);
    // The shared classmate appears ONCE despite being in both classes.
    expect(result.current.entries.filter((entry) => entry.displayName === 'Shared')).toHaveLength(1);
    // The viewer appears once, flagged, with their LIVE local XP.
    const mine = result.current.entries.filter((entry) => entry.isCurrentUser);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ displayName: 'Maya', xp: 250 });

    // The fetched union is de-duplicated (me/shared counted once each).
    const calledWith = mocks.getLeaderboardEntriesByIds.mock.calls[0][1] as string[];
    expect(calledWith).toHaveLength(4);
    expect(new Set(calledWith)).toEqual(new Set(['me', 'alpha', 'shared', 'bravo']));
  });

  it('yields a class-only gap message from the combined standing', async () => {
    signedInCloud();
    local.totalXp = 250;
    classesState.classes = [makeClass('AAA1', ['me', 'alpha'])];
    mocks.getLeaderboardEntriesByIds.mockResolvedValue([
      { id: 'alpha', displayName: 'Alpha', xp: 300 },
    ]);

    const { result } = renderHook(() => useCombinedClassLeaderboard());

    await waitFor(() => expect(result.current.entries).toHaveLength(2));

    // The gap is computed against the classmate (Alpha), not any global board.
    expect(computeLeaderboardGapMessage(result.current.entries, 'me')).toEqual({
      text: "You're only 50 XP behind Alpha — one good session and you pass them!",
    });
  });

  it('hides (viewer-only board, no fetch) when the user is in no classes', () => {
    signedInCloud();
    classesState.classes = [];
    local.totalXp = 120;

    const { result } = renderHook(() => useCombinedClassLeaderboard());

    expect(result.current.status).toBe('ready');
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({ displayName: 'Maya', isCurrentUser: true });
    expect(mocks.getLeaderboardEntriesByIds).not.toHaveBeenCalled();
    // The dashboard renders nothing for a viewer-only board.
    expect(computeLeaderboardGapMessage(result.current.entries, 'me')).toBeNull();
  });

  it('hides when the viewer is the only member of their class (alone)', async () => {
    signedInCloud();
    local.totalXp = 120;
    classesState.classes = [makeClass('SOLO1', ['me'])];
    // A stale self row exists; buildCloudLeaderboard drops it for the live XP row.
    mocks.getLeaderboardEntriesByIds.mockResolvedValue([
      { id: 'me', displayName: 'Maya (stale)', xp: 50 },
    ]);

    const { result } = renderHook(() => useCombinedClassLeaderboard());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.entries).toHaveLength(1);
    expect(computeLeaderboardGapMessage(result.current.entries, 'me')).toBeNull();
  });

  it('reports loading while the class list is still loading', () => {
    signedInCloud();
    classesState.status = 'loading';

    const { result } = renderHook(() => useCombinedClassLeaderboard());

    expect(result.current.status).toBe('loading');
  });

  it('reports loading while classmate profiles are being fetched', async () => {
    signedInCloud();
    classesState.classes = [makeClass('AAA1', ['me', 'alpha'])];
    // Never resolves → the member fetch stays in flight.
    mocks.getLeaderboardEntriesByIds.mockReturnValue(new Promise<LeaderboardEntry[]>(() => {}));

    const { result } = renderHook(() => useCombinedClassLeaderboard());

    await waitFor(() => expect(result.current.status).toBe('loading'));
  });

  it('is unavailable when Firebase is down or the user is signed out', () => {
    // beforeEach leaves db null + available/signedIn false (the signed-out path).
    const { result } = renderHook(() => useCombinedClassLeaderboard());

    expect(result.current.status).toBe('unavailable');
    expect(mocks.getLeaderboardEntriesByIds).not.toHaveBeenCalled();
  });

  it('reports an error when the class-list listener failed', () => {
    signedInCloud();
    classesState.error = true;

    const { result } = renderHook(() => useCombinedClassLeaderboard());

    expect(result.current.status).toBe('error');
  });

  it('reports an error when the classmate-profile fetch fails', async () => {
    signedInCloud();
    classesState.classes = [makeClass('AAA1', ['me', 'alpha'])];
    mocks.getLeaderboardEntriesByIds.mockRejectedValue(new Error('nope'));

    const { result } = renderHook(() => useCombinedClassLeaderboard());

    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
