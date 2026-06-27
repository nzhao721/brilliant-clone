import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arrayUnion, getDoc, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import {
  RACE_CODE_ALPHABET,
  createRaceMatch,
  generateRaceCode,
  joinRaceMatch,
  resolveWinner,
  startRaceMatch,
  type PlayerSnapshot,
} from './raceMatch';

// Firestore is mocked so the data layer is exercised WITHOUT a network: refs are
// plain objects, sentinels stand in for serverTimestamp/arrayUnion, and
// getDoc/runTransaction are driven per-test. Mirrors the hoisted-mock pattern
// used across the suite (see classData.test.ts).
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
    id: segments[segments.length - 1],
  })),
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => '__SERVER_TS__'),
  arrayUnion: vi.fn((...values: unknown[]) => ({ __arrayUnion: values })),
}));

const mockedGetDoc = vi.mocked(getDoc);
const mockedRunTransaction = vi.mocked(runTransaction);
const mockedSetDoc = vi.mocked(setDoc);
const mockedUpdateDoc = vi.mocked(updateDoc);

const db = { name: 'mock-db' } as never;

function makePlayer(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    uid: 'player',
    displayName: 'Player',
    position: 0,
    velocity: 0,
    finished: false,
    finishedAt: null,
    ...overrides,
  };
}

function matchDoc(data: Record<string, unknown>) {
  return { exists: () => true, data: () => data } as never;
}

const missingDoc = { exists: () => false, data: () => ({}) } as never;

// Drives runTransaction with a single scripted match read and records the
// transaction.update() calls so the waiting->racing flip can be asserted.
function scriptTransaction(step: { exists: boolean; data?: Record<string, unknown> }) {
  const updateCalls: Array<{ ref: unknown; data: Record<string, unknown> }> = [];

  mockedRunTransaction.mockImplementation(async (_db: unknown, updateFn: unknown) => {
    const transaction = {
      get: async () => ({ exists: () => step.exists, data: () => step.data ?? {} }),
      set: () => {},
      update: (ref: unknown, data: Record<string, unknown>) => updateCalls.push({ ref, data }),
    };
    return (updateFn as (tx: typeof transaction) => unknown)(transaction);
  });

  return { updateCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateRaceCode', () => {
  const codes = Array.from({ length: 500 }, () => generateRaceCode());

  it('produces 5- or 6-character uppercase codes', () => {
    for (const code of codes) {
      expect(code.length).toBeGreaterThanOrEqual(5);
      expect(code.length).toBeLessThanOrEqual(6);
      expect(code).toBe(code.toUpperCase());
    }
  });

  it('only uses characters from the unambiguous alphabet', () => {
    const allowed = new Set(RACE_CODE_ALPHABET);

    for (const code of codes) {
      for (const char of code) {
        expect(allowed.has(char)).toBe(true);
      }
    }
  });

  it('never includes ambiguous characters (O, 0, I, 1, L)', () => {
    for (const code of codes) {
      expect(code).not.toMatch(/[O0I1L]/);
    }
  });

  it('produces varied codes', () => {
    // 500 draws from 31^5+ combinations should yield many distinct codes;
    // anything near a constant would signal broken randomness.
    expect(new Set(codes).size).toBeGreaterThan(100);
  });
});

describe('resolveWinner', () => {
  it('returns null when there are no players', () => {
    expect(resolveWinner([])).toBeNull();
  });

  it('returns null when nobody has finished', () => {
    const players = [
      makePlayer({ uid: 'a', position: 400 }),
      makePlayer({ uid: 'b', position: 950 }),
    ];

    expect(resolveWinner(players)).toBeNull();
  });

  it('returns the earliest finisher among finished players', () => {
    const players = [
      makePlayer({ uid: 'a', finished: true, finishedAt: 2_000 }),
      makePlayer({ uid: 'b', finished: true, finishedAt: 1_500 }),
      makePlayer({ uid: 'c', finished: false, finishedAt: null }),
    ];

    expect(resolveWinner(players)).toBe('b');
  });

  it('ranks a 4-player field by who crossed first', () => {
    // N-capable: the winner is the earliest finisher regardless of how many
    // players (finished or not) are in the race.
    const players = [
      makePlayer({ uid: 'a', finished: true, finishedAt: 3_000 }),
      makePlayer({ uid: 'b', finished: true, finishedAt: 1_200 }),
      makePlayer({ uid: 'c', finished: true, finishedAt: 2_500 }),
      makePlayer({ uid: 'd', finished: false, position: 1_800 }),
    ];

    expect(resolveWinner(players)).toBe('b');
  });

  it('ignores the order players are listed in', () => {
    const players = [
      makePlayer({ uid: 'late', finished: true, finishedAt: 9_000 }),
      makePlayer({ uid: 'early', finished: true, finishedAt: 100 }),
    ];

    expect(resolveWinner(players)).toBe('early');
  });

  it('ignores players flagged finished but missing a numeric finishedAt', () => {
    const players = [
      makePlayer({ uid: 'no-timestamp', finished: true, finishedAt: null }),
      makePlayer({ uid: 'real', finished: true, finishedAt: 3_200 }),
    ];

    expect(resolveWinner(players)).toBe('real');
  });

  it('returns null when the only finished player has no finishedAt', () => {
    const players = [makePlayer({ uid: 'ghost', finished: true, finishedAt: null })];

    expect(resolveWinner(players)).toBeNull();
  });
});

describe('createRaceMatch', () => {
  it('creates a waiting match with the host as the sole participant + a host player doc', async () => {
    const code = await createRaceMatch(db, {
      hostUid: 'host',
      hostName: 'Host',
      seed: 5,
      chapterIds: [],
      raceDistance: 1000,
    });

    expect(code).toMatch(new RegExp(`^[${RACE_CODE_ALPHABET}]{5,6}$`));
    // One write for the match doc, one for the host's player doc.
    expect(mockedSetDoc).toHaveBeenCalledTimes(2);
    expect(mockedSetDoc.mock.calls[0][1]).toMatchObject({
      status: 'waiting',
      hostUid: 'host',
      participants: ['host'],
      winnerUid: null,
      seed: 5,
      raceDistance: 1000,
    });
    expect(mockedSetDoc.mock.calls[1][1]).toMatchObject({
      uid: 'host',
      displayName: 'Host',
      position: 0,
      finished: false,
    });
  });
});

describe('joinRaceMatch (N players, no cap)', () => {
  it('appends a THIRD player to a waiting match without flipping status (no auto-start)', async () => {
    mockedGetDoc.mockResolvedValue(
      matchDoc({
        status: 'waiting',
        hostUid: 'host',
        participants: ['host', 'p2'],
        winnerUid: null,
        seed: 1,
        chapterIds: [],
        raceDistance: 1000,
      }),
    );

    await joinRaceMatch(db, 'CODE', 'p3', 'P3');

    // Atomic append of self only — and CRUCIALLY no status/startedAt change: the
    // room stays `waiting` until the host starts it.
    expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
    expect(mockedUpdateDoc.mock.calls[0][1]).toEqual({ participants: { __arrayUnion: ['p3'] } });
    expect(arrayUnion).toHaveBeenCalledWith('p3');

    // My player doc is created (merge so a reconnect never clobbers live state).
    expect(mockedSetDoc).toHaveBeenCalledTimes(1);
    expect(mockedSetDoc.mock.calls[0][1]).toMatchObject({ uid: 'p3', displayName: 'P3', position: 0 });
    expect(mockedSetDoc.mock.calls[0][2]).toEqual({ merge: true });
  });

  it('appends a FOURTH player too — there is no player cap', async () => {
    mockedGetDoc.mockResolvedValue(
      matchDoc({
        status: 'waiting',
        hostUid: 'host',
        participants: ['host', 'p2', 'p3'],
        winnerUid: null,
      }),
    );

    await joinRaceMatch(db, 'CODE', 'p4', 'P4');

    expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
    expect(arrayUnion).toHaveBeenCalledWith('p4');
  });

  it('is idempotent for a player already in the match (refreshes the player doc only)', async () => {
    mockedGetDoc.mockResolvedValue(
      matchDoc({ status: 'waiting', hostUid: 'host', participants: ['host', 'p2'], winnerUid: null }),
    );

    await joinRaceMatch(db, 'CODE', 'p2', 'P2');

    expect(mockedUpdateDoc).not.toHaveBeenCalled();
    expect(mockedSetDoc).toHaveBeenCalledTimes(1);
  });

  it('rejects joining a race that has already STARTED (no mid-race join)', async () => {
    mockedGetDoc.mockResolvedValue(
      matchDoc({ status: 'racing', hostUid: 'host', participants: ['host', 'p2'], winnerUid: null }),
    );

    await expect(joinRaceMatch(db, 'CODE', 'p3', 'P3')).rejects.toThrow(/already started/i);
    expect(mockedUpdateDoc).not.toHaveBeenCalled();
    expect(mockedSetDoc).not.toHaveBeenCalled();
  });

  it('rejects joining a finished race', async () => {
    mockedGetDoc.mockResolvedValue(
      matchDoc({ status: 'finished', hostUid: 'host', participants: ['host', 'p2'], winnerUid: 'host' }),
    );

    await expect(joinRaceMatch(db, 'CODE', 'p3', 'P3')).rejects.toThrow(/already finished/i);
    expect(mockedUpdateDoc).not.toHaveBeenCalled();
  });

  it('rejects an unknown room code', async () => {
    mockedGetDoc.mockResolvedValue(missingDoc);

    await expect(joinRaceMatch(db, 'NOPE', 'p3', 'P3')).rejects.toThrow(/not found/i);
  });
});

describe('startRaceMatch (host-only start)', () => {
  it('flips a waiting room to racing and stamps startedAt when the HOST starts', async () => {
    const { updateCalls } = scriptTransaction({
      exists: true,
      data: { status: 'waiting', hostUid: 'host', participants: ['host', 'p2', 'p3'], winnerUid: null },
    });

    await startRaceMatch(db, 'CODE', 'host');

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].data).toEqual({ status: 'racing', startedAt: '__SERVER_TS__' });
  });

  it('rejects a NON-host trying to start the race', async () => {
    const { updateCalls } = scriptTransaction({
      exists: true,
      data: { status: 'waiting', hostUid: 'host', participants: ['host', 'p2'], winnerUid: null },
    });

    await expect(startRaceMatch(db, 'CODE', 'p2')).rejects.toThrow(/only the host/i);
    expect(updateCalls).toHaveLength(0);
  });

  it('is an idempotent no-op when the race is already racing', async () => {
    const { updateCalls } = scriptTransaction({
      exists: true,
      data: { status: 'racing', hostUid: 'host', participants: ['host', 'p2'], winnerUid: null },
    });

    await expect(startRaceMatch(db, 'CODE', 'host')).resolves.toBeUndefined();
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects starting a finished race', async () => {
    const { updateCalls } = scriptTransaction({
      exists: true,
      data: { status: 'finished', hostUid: 'host', participants: ['host', 'p2'], winnerUid: 'host' },
    });

    await expect(startRaceMatch(db, 'CODE', 'host')).rejects.toThrow(/no longer be started/i);
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects starting a match that does not exist', async () => {
    scriptTransaction({ exists: false });

    await expect(startRaceMatch(db, 'CODE', 'host')).rejects.toThrow(/not found/i);
  });
});
