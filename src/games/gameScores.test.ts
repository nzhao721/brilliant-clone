import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDoc, limit, onSnapshot, orderBy, runTransaction } from 'firebase/firestore';
import {
  gameScoreStorageKey,
  gameScoreStorageKeyPrefix,
  normalizeGameScoreEntry,
  normalizeScore,
  readGameBest,
  recordGameScore,
  recordLocalGameBest,
  resetCloudGameScores,
  resetGameScores,
  subscribeGameLeaderboard,
} from './gameScores';

// Firestore is mocked so the cloud data layer runs WITHOUT a network: refs are
// plain objects, sentinels stand in for serverTimestamp, and transactions /
// listeners are driven per-test (mirrors classData.test.ts).
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
    id: segments[segments.length - 1],
  })),
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints })),
  orderBy: vi.fn((field: string, direction: string) => ({ orderBy: field, direction })),
  limit: vi.fn((value: number) => ({ limit: value })),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => '__SERVER_TS__'),
  deleteDoc: vi.fn(),
}));

const mockedRunTransaction = vi.mocked(runTransaction);
const mockedOnSnapshot = vi.mocked(onSnapshot);
const mockedDeleteDoc = vi.mocked(deleteDoc);

const db = { name: 'mock-db' } as never;

type SetCall = { ref: { id: string; path: string }; data: Record<string, unknown> };

// Drives the single transaction recordGameScore performs and records set calls.
function mockTransaction(existing: { exists: boolean; data?: Record<string, unknown> }): SetCall[] {
  const setCalls: SetCall[] = [];

  mockedRunTransaction.mockImplementation(async (_db: unknown, updateFn: unknown) => {
    const transaction = {
      get: async () => ({ exists: () => existing.exists, data: () => existing.data ?? {} }),
      set: (ref: { id: string; path: string }, data: Record<string, unknown>) =>
        setCalls.push({ ref, data }),
    };
    return (updateFn as (tx: typeof transaction) => unknown)(transaction);
  });

  return setCalls;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('normalizeScore', () => {
  it('floors, rejects invalid/negative, keeps zero, and clamps to the max', () => {
    expect(normalizeScore(42)).toBe(42);
    expect(normalizeScore(42.9)).toBe(42);
    expect(normalizeScore(0)).toBe(0);
    expect(normalizeScore(-1)).toBeNull();
    expect(normalizeScore(Number.NaN)).toBeNull();
    expect(normalizeScore(Number.POSITIVE_INFINITY)).toBeNull();
    expect(normalizeScore('nope')).toBeNull();
    expect(normalizeScore(2_000_000_000)).toBe(1_000_000_000);
  });
});

describe('local personal best', () => {
  it('namespaces each game under its own prefixed key', () => {
    expect(gameScoreStorageKey('snake')).toBe(`${gameScoreStorageKeyPrefix}snake`);
  });

  it('keeps only the single best across runs, flooring and ignoring invalid runs', () => {
    expect(recordLocalGameBest('tetris', 10)).toBe(10);
    expect(recordLocalGameBest('tetris', 25.9)).toBe(25);
    expect(recordLocalGameBest('tetris', 7)).toBe(25); // worse run keeps best
    expect(recordLocalGameBest('tetris', Number.NaN)).toBe(25); // invalid → no change
    expect(readGameBest('tetris')).toBe(25);
  });

  it('reads a legacy run-array store as its max', () => {
    window.localStorage.setItem(gameScoreStorageKey('snake'), JSON.stringify([10, 48, 35]));
    expect(readGameBest('snake')).toBe(48);
  });

  it('returns null for an unset best', () => {
    expect(readGameBest('never-played')).toBeNull();
  });

  it('resetGameScores clears every prefixed store but leaves unrelated keys', () => {
    recordLocalGameBest('snake', 30);
    recordLocalGameBest('2048', 4000);
    window.localStorage.setItem('brilliant-clone.completed-lessons', '["x"]');

    resetGameScores();

    expect(readGameBest('snake')).toBeNull();
    expect(readGameBest('2048')).toBeNull();
    expect(window.localStorage.getItem('brilliant-clone.completed-lessons')).toBe('["x"]');
  });
});

describe('normalizeGameScoreEntry', () => {
  it('maps a well-formed score doc to a LeaderboardEntry (score → xp)', () => {
    expect(normalizeGameScoreEntry('uid-1', { displayName: '  Carl Gauss ', score: 1234 })).toEqual({
      id: 'uid-1',
      displayName: 'Carl Gauss',
      xp: 1234,
    });
  });

  it('floors/clamps the score and falls back to a neutral name', () => {
    expect(normalizeGameScoreEntry('u', { score: 99.9 })?.xp).toBe(99);
    expect(normalizeGameScoreEntry('u', { score: -5 })?.xp).toBe(0);
    expect(normalizeGameScoreEntry('u', { score: 'nope' })?.xp).toBe(0);
    expect(normalizeGameScoreEntry('u', { displayName: '' })?.displayName).toBe('Learner');
    expect(normalizeGameScoreEntry('u', { displayName: 'a'.repeat(200) })?.displayName).toHaveLength(80);
  });

  it('returns null for an empty uid', () => {
    expect(normalizeGameScoreEntry('', { score: 5 })).toBeNull();
  });
});

describe('recordGameScore (cloud, best-only)', () => {
  it('creates a fresh row when the player has no cloud best', async () => {
    const setCalls = mockTransaction({ exists: false });

    await recordGameScore(db, 'snake', { uid: 'me', displayName: 'Maya', score: 42 });

    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].ref.id).toBe('me');
    expect(setCalls[0].ref.path).toBe('gameScores/snake/scores/me');
    expect(setCalls[0].data).toEqual({
      uid: 'me',
      displayName: 'Maya',
      score: 42,
      updatedAt: '__SERVER_TS__',
    });
  });

  it('updates only when the run beats the stored best', async () => {
    const setCalls = mockTransaction({ exists: true, data: { score: 10 } });

    await recordGameScore(db, 'snake', { uid: 'me', displayName: 'Maya', score: 25 });

    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].data.score).toBe(25);
  });

  it('is a no-op when the run does not beat the stored best', async () => {
    const setCalls = mockTransaction({ exists: true, data: { score: 25 } });

    await recordGameScore(db, 'snake', { uid: 'me', displayName: 'Maya', score: 10 });
    await recordGameScore(db, 'snake', { uid: 'me', displayName: 'Maya', score: 25 }); // equal

    expect(setCalls).toHaveLength(0);
  });

  it('ignores an invalid score without opening a transaction', async () => {
    await recordGameScore(db, 'snake', { uid: 'me', displayName: 'Maya', score: Number.NaN });
    expect(mockedRunTransaction).not.toHaveBeenCalled();
  });
});

describe('subscribeGameLeaderboard', () => {
  it('queries top-N by score desc and normalizes the live snapshot', () => {
    let emit: ((snapshot: unknown) => void) | undefined;
    let fail: (() => void) | undefined;
    const unsubscribe = vi.fn();
    mockedOnSnapshot.mockImplementation((_query: unknown, onNext: unknown, onError: unknown) => {
      emit = onNext as (snapshot: unknown) => void;
      fail = onError as () => void;
      return unsubscribe;
    });

    const onEntries = vi.fn();
    const onError = vi.fn();
    const stop = subscribeGameLeaderboard(db, 'snake', 10, onEntries, onError);

    expect(orderBy).toHaveBeenCalledWith('score', 'desc');
    expect(limit).toHaveBeenCalledWith(10);

    emit?.({
      docs: [
        { id: 'a', data: () => ({ displayName: 'Alpha', score: 300 }) },
        { id: 'b', data: () => ({ displayName: 'Bravo', score: 100 }) },
      ],
    });

    expect(onEntries).toHaveBeenCalledWith([
      { id: 'a', displayName: 'Alpha', xp: 300 },
      { id: 'b', displayName: 'Bravo', xp: 100 },
    ]);

    fail?.();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(stop).toBe(unsubscribe);
  });
});

describe('resetCloudGameScores', () => {
  it("deletes the user's score doc for every supplied game", async () => {
    mockedDeleteDoc.mockResolvedValue(undefined);

    await resetCloudGameScores(db, 'me', ['snake', 'tetris', '2048']);

    expect(mockedDeleteDoc).toHaveBeenCalledTimes(3);
    const deletedPaths = mockedDeleteDoc.mock.calls.map(
      ([ref]) => (ref as { path: string }).path,
    );
    expect(deletedPaths).toEqual([
      'gameScores/snake/scores/me',
      'gameScores/tetris/scores/me',
      'gameScores/2048/scores/me',
    ]);
  });
});
