import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRaceMatch,
  joinRaceMatch,
  startRaceMatch,
  subscribeMatch,
  subscribePlayers,
  writePlayerSnapshot,
  type PlayerSnapshot,
  type RaceMatch,
} from './raceMatch';
import { useRaceMatch } from './useRaceMatch';

/* Truthy `db` (online available) + a fixed signed-in user. raceMatch is mocked so the hook runs without a network: subscribeMatch/subscribePlayers expose their callbacks (driven per-test) and the actions are spies. */
vi.mock('../lib/firebase', () => ({ db: { name: 'mock-db' } }));
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me', displayName: 'Me' } }),
}));
vi.mock('./raceMatch', () => ({
  subscribeMatch: vi.fn(() => () => {}),
  subscribePlayers: vi.fn(() => () => {}),
  createRaceMatch: vi.fn(),
  joinRaceMatch: vi.fn(),
  startRaceMatch: vi.fn(),
  claimWinner: vi.fn(),
  writePlayerSnapshot: vi.fn(),
}));

const mockedSubscribeMatch = vi.mocked(subscribeMatch);
const mockedSubscribePlayers = vi.mocked(subscribePlayers);

function makeMatch(overrides: Partial<RaceMatch> = {}): RaceMatch {
  return {
    code: 'CODE',
    status: 'waiting',
    seed: 1,
    chapterIds: [],
    raceDistance: 1000,
    hostUid: 'me',
    participants: ['me', 'a', 'b'],
    winnerUid: null,
    ...overrides,
  };
}

function makePlayer(uid: string, overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    uid,
    displayName: uid.toUpperCase(),
    position: 0,
    velocity: 0,
    finished: false,
    finishedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createRaceMatch).mockResolvedValue('NEWCODE');
  vi.mocked(joinRaceMatch).mockResolvedValue(undefined);
  vi.mocked(startRaceMatch).mockResolvedValue(undefined);
  /* The hook fire-and-forgets writes (`void writePlayerSnapshot(...).catch(...)`), so the mock must return a promise. */
  vi.mocked(writePlayerSnapshot).mockResolvedValue(undefined);
});

/* Joins a code (-> subscribes), then drives the captured match + players callbacks with the given snapshots. */
async function joinAndEmit(
  result: { current: ReturnType<typeof useRaceMatch> },
  match: RaceMatch,
  players: PlayerSnapshot[],
) {
  await act(async () => {
    await result.current.joinMatch(match.code);
  });

  const matchCb = mockedSubscribeMatch.mock.calls.at(-1)?.[2] as (m: RaceMatch | null) => void;
  const playersCb = mockedSubscribePlayers.mock.calls.at(-1)?.[2] as (p: PlayerSnapshot[]) => void;

  act(() => {
    matchCb(match);
    playersCb(players);
  });
}

describe('useRaceMatch (N opponents)', () => {
  it('starts with no opponents and online available', () => {
    const { result } = renderHook(() => useRaceMatch());

    expect(result.current.opponents).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isHost).toBe(false);
  });

  it('exposes EVERY other player as an opponent (ordered by join order)', async () => {
    const { result } = renderHook(() => useRaceMatch());

    await joinAndEmit(result, makeMatch(), [
      makePlayer('b', { position: 5 }),
      makePlayer('me', { position: 10 }),
      makePlayer('a', { position: 20 }),
    ]);

    // me is resolved from the players list…
    expect(result.current.me?.uid).toBe('me');
    expect(result.current.players.map((player) => player.uid).sort()).toEqual(['a', 'b', 'me']);
    // …and opponents are everyone else, ordered by participants (host first).
    expect(result.current.opponents.map((opponent) => opponent.uid)).toEqual(['a', 'b']);
    expect(result.current.participants).toEqual(['me', 'a', 'b']);
  });

  it('reports isHost from the match hostUid', async () => {
    const { result } = renderHook(() => useRaceMatch());

    await joinAndEmit(result, makeMatch({ hostUid: 'me' }), [makePlayer('me'), makePlayer('a')]);
    expect(result.current.isHost).toBe(true);

    // A match hosted by someone else flips isHost off.
    const playersCb = mockedSubscribePlayers.mock.calls.at(-1)?.[2] as (p: PlayerSnapshot[]) => void;
    const matchCb = mockedSubscribeMatch.mock.calls.at(-1)?.[2] as (m: RaceMatch | null) => void;
    act(() => {
      matchCb(makeMatch({ hostUid: 'a' }));
      playersCb([makePlayer('me'), makePlayer('a')]);
    });
    expect(result.current.isHost).toBe(false);
  });

  it('startRace delegates to startRaceMatch with the active code + my uid', async () => {
    const { result } = renderHook(() => useRaceMatch());

    await joinAndEmit(result, makeMatch(), [makePlayer('me'), makePlayer('a')]);

    await act(async () => {
      await result.current.startRace();
    });

    expect(startRaceMatch).toHaveBeenCalledWith(expect.anything(), 'CODE', 'me');
  });

  it('tracks status from the live match doc', async () => {
    const { result } = renderHook(() => useRaceMatch());
    expect(result.current.status).toBe('waiting');

    await joinAndEmit(result, makeMatch({ status: 'racing' }), [makePlayer('me'), makePlayer('a')]);
    expect(result.current.status).toBe('racing');
  });
});

describe('useRaceMatch broadcast cadence (no fixed heartbeat)', () => {
  /* Controllable clock so the throttle is deterministic (not real-time): reportMyCar broadcasts on a short cadence while moving, immediately on a big swing, never idle/finished. */
  it('broadcasts movement on a short cadence + immediately on a big swing, and never when idle/finished', async () => {
    const clock = { now: 1_000_000 };
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => clock.now);
    const writes = vi.mocked(writePlayerSnapshot);

    try {
      const { result } = renderHook(() => useRaceMatch());
      await joinAndEmit(result, makeMatch({ status: 'racing' }), [
        makePlayer('me'),
        makePlayer('a'),
      ]);
      writes.mockClear();

      const report = (position: number, velocity: number) =>
        act(() => {
          result.current.reportMyCar({ position, velocity, finished: false, finishedAt: null });
        });

      // Idle at the start line (0/0): nothing to broadcast.
      report(0, 0);
      expect(writes).not.toHaveBeenCalled();

      // First real movement writes right away.
      report(5, 10);
      expect(writes).toHaveBeenCalledTimes(1);

      // A further small change BEFORE the ~150ms floor is throttled.
      clock.now += 50;
      report(6, 10.2);
      expect(writes).toHaveBeenCalledTimes(1);

      // Once the floor has elapsed, the next change broadcasts.
      clock.now += 120; // 170ms since the last write
      report(12, 11);
      expect(writes).toHaveBeenCalledTimes(2);

      /* A big velocity swing (e.g. wrong-answer stall) jumps the queue: writes immediately after only ~60ms. */
      clock.now += 60;
      report(12, 0);
      expect(writes).toHaveBeenCalledTimes(3);

      /* The finished sample is owned by claimFinish — a routine report never broadcasts a finished car. */
      clock.now += 500;
      act(() => {
        result.current.reportMyCar({
          position: 2500,
          velocity: 0,
          finished: true,
          finishedAt: clock.now,
        });
      });
      expect(writes).toHaveBeenCalledTimes(3);
    } finally {
      dateNow.mockRestore();
    }
  });
});
