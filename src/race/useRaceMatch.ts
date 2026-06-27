import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { useAuth } from '../auth/AuthContext';
import { db } from '../lib/firebase';
import {
  claimWinner,
  createRaceMatch,
  joinRaceMatch,
  startRaceMatch,
  subscribeMatch,
  subscribePlayers,
  writePlayerSnapshot,
  type PlayerSnapshot,
  type RaceMatch,
  type RaceStatus,
} from './raceMatch';

// ---------------------------------------------------------------------------
// useRaceMatch — the online (Firestore) real-time hook for Slipstream.
//
// Each client is the sole authority over its OWN car: it simulates at 60fps and
// pushes state here via `reportMyCar`, which broadcasts as fast as practical
// (throttled to a short min interval, immediate on a big speed swing; the finish
// is written by `claimFinish`). Every other car is read via onSnapshot, so a race
// supports any number of players (`opponents` is everyone except me). The lobby is
// host-controlled. Degrades gracefully: with `db` null (unconfigured/test mode)
// `error` is set and create/join/start are no-ops.
// ---------------------------------------------------------------------------

// Broadcast cadence: reads are real-time (onSnapshot); only writes are throttled.
// ~150ms floor keeps a moving car to a handful of writes/sec (vs 60) while tracking
// near-instantly; a not-meaningfully-moving car writes nothing.
const MIN_BROADCAST_INTERVAL_MS = 150;
// Hard floor for IMMEDIATE key-event writes (rare discrete events, so rarely bites).
const IMMEDIATE_EVENT_FLOOR_MS = 50;
// Below these deltas the car hasn't meaningfully changed, so skip the write
// (metres / (m/s); both tiny relative to the track and top speed).
const POSITION_EPSILON = 0.5;
const VELOCITY_EPSILON = 0.5;
// A velocity jump this large is a discrete event (a wrong-answer stall, a collision)
// — broadcast it immediately instead of waiting for the next cadence tick.
const BIG_VELOCITY_DELTA = 6;
const ONLINE_UNAVAILABLE_MESSAGE = 'Online multiplayer is unavailable.';

/** The last car state we actually broadcast, plus when (epoch ms). */
type BroadcastSample = { at: number; position: number; velocity: number };

/** The minimal car state the UI hands back each frame (no fuel/score — local). */
export type RaceCarInput = {
  position: number;
  velocity: number;
  finished: boolean;
  finishedAt: number | null;
};

type CreateMatchInput = {
  seed: number;
  /** Chapter pool for the race; `[]` means the full question bank (online is ungated). */
  chapterIds: string[];
  raceDistance: number;
};

export type UseRaceMatchResult = {
  /** The live match doc, or null before a race is created/joined. */
  match: RaceMatch | null;
  /** The signed-in player's live snapshot from the players subcollection. */
  me: PlayerSnapshot | null;
  /** Every OTHER player's snapshot, ordered by join order (host first) for stable colours/lanes. */
  opponents: PlayerSnapshot[];
  /** Every player's live snapshot INCLUDING me (handy for ranking all racers). */
  players: PlayerSnapshot[];
  /** The match's participant uids (host first), or empty before a match. */
  participants: string[];
  /** True when the signed-in player created (hosts) the current match. */
  isHost: boolean;
  /** Convenience view of `match.status` ('waiting' before any match). */
  status: RaceStatus;
  /** User-facing error string, or null. Set when multiplayer is unavailable. */
  error: string | null;
  /** Hosts a new race; resolves to the shareable code, or null on failure. */
  createMatch: (input: CreateMatchInput) => Promise<string | null>;
  /** Joins a race by code; resolves `true`/`false` (failure reason also surfaced via `error`). */
  joinMatch: (code: string) => Promise<boolean>;
  /** Host-only: starts the race (waiting -> racing); surfaces failures via `error`. */
  startRace: () => Promise<void>;
  /** Hands my car's latest state to the hook each frame; it broadcasts as fast as practical. */
  reportMyCar: (car: RaceCarInput) => void;
  /**
   * Writes my finished snapshot then atomically claims the win, both immediately.
   * `finishedAt` stamps the exact crossing time so the authoritative
   * earliest-finisher comparison matches what the player saw.
   */
  claimFinish: (finishedAt?: number) => Promise<void>;
};

function resolveDisplayName(user: User): string {
  return user.displayName?.trim() || user.email?.split('@')[0]?.trim() || 'Player';
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useRaceMatch(): UseRaceMatchResult {
  const { user } = useAuth();

  const [code, setCode] = useState<string | null>(null);
  const [match, setMatch] = useState<RaceMatch | null>(null);
  const [players, setPlayers] = useState<PlayerSnapshot[]>([]);
  const [error, setError] = useState<string | null>(() =>
    db ? null : ONLINE_UNAVAILABLE_MESSAGE,
  );

  // Refs so 60fps updates never re-render. `finishedRef` short-circuits broadcasts
  // the instant we claim a finish; `lastBroadcastRef` (last written state + time)
  // powers the throttle in `reportMyCar`.
  const carRef = useRef<RaceCarInput | null>(null);
  const finishedRef = useRef(false);
  const lastBroadcastRef = useRef<BroadcastSample | null>(null);

  const uid = user?.uid ?? null;

  // Mirror the values `reportMyCar` reads so it stays a stable callback (the rAF
  // loop never re-subscribes when code/user/status change).
  const codeRef = useRef<string | null>(code);
  const userRef = useRef<User | null>(user);
  const statusRef = useRef<RaceStatus>('waiting');
  codeRef.current = code;
  userRef.current = user;

  const participants = useMemo(() => match?.participants ?? [], [match]);

  const me = useMemo(
    () => (uid ? players.find((player) => player.uid === uid) ?? null : null),
    [players, uid],
  );
  // All other players, ordered by their slot in `participants` (host first) so each
  // keeps a stable colour/lane even as the players snapshot reorders.
  const opponents = useMemo(() => {
    if (!uid) {
      return [];
    }
    const order = new Map(participants.map((participantUid, index) => [participantUid, index]));
    return players
      .filter((player) => player.uid !== uid)
      .sort(
        (a, b) =>
          (order.get(a.uid) ?? Number.MAX_SAFE_INTEGER) -
            (order.get(b.uid) ?? Number.MAX_SAFE_INTEGER) || a.uid.localeCompare(b.uid),
      );
  }, [players, participants, uid]);
  const isHost = Boolean(uid && match && match.hostUid === uid);
  const status: RaceStatus = match?.status ?? 'waiting';
  statusRef.current = status;

  // Subscribe to the match doc + players subcollection; reset local state on code
  // change so a previous race never flashes.
  useEffect(() => {
    if (!db || !code) {
      return undefined;
    }

    const database = db;
    finishedRef.current = false;
    carRef.current = null;
    lastBroadcastRef.current = null;
    setMatch(null);
    setPlayers([]);

    const unsubscribeMatch = subscribeMatch(database, code, setMatch);
    const unsubscribePlayers = subscribePlayers(database, code, setPlayers);

    return () => {
      unsubscribeMatch();
      unsubscribePlayers();
    };
  }, [code]);

  const createMatch = useCallback(
    async ({ seed, chapterIds, raceDistance }: CreateMatchInput): Promise<string | null> => {
      if (!db) {
        setError(ONLINE_UNAVAILABLE_MESSAGE);
        return null;
      }
      if (!user) {
        setError('Sign in to race a friend online.');
        return null;
      }

      try {
        setError(null);
        const newCode = await createRaceMatch(db, {
          hostUid: user.uid,
          hostName: resolveDisplayName(user),
          seed,
          chapterIds,
          raceDistance,
        });
        setCode(newCode);
        return newCode;
      } catch (caught) {
        setError(toErrorMessage(caught, 'Could not create the race. Please try again.'));
        return null;
      }
    },
    [user],
  );

  const joinMatch = useCallback(
    async (joinCode: string): Promise<boolean> => {
      if (!db) {
        setError(ONLINE_UNAVAILABLE_MESSAGE);
        return false;
      }
      if (!user) {
        setError('Sign in to join a race.');
        return false;
      }

      const normalizedCode = joinCode.trim().toUpperCase();
      if (!normalizedCode) {
        setError('Enter a race code to join.');
        return false;
      }

      try {
        setError(null);
        await joinRaceMatch(db, normalizedCode, user.uid, resolveDisplayName(user));
        setCode(normalizedCode);
        return true;
      } catch (caught) {
        setError(toErrorMessage(caught, 'Could not join the race. Please try again.'));
        return false;
      }
    },
    [user],
  );

  const startRace = useCallback(async (): Promise<void> => {
    if (!db) {
      setError(ONLINE_UNAVAILABLE_MESSAGE);
      return;
    }
    if (!user || !code) {
      setError('Create a race before starting it.');
      return;
    }

    try {
      setError(null);
      await startRaceMatch(db, code, user.uid);
    } catch (caught) {
      setError(toErrorMessage(caught, 'Could not start the race. Please try again.'));
    }
  }, [code, user]);

  // Called every frame by RaceView: stash the latest car state, then broadcast on a
  // ~150ms cadence (or immediately on a big swing). Stable callback (reads from
  // refs); a write happens the moment it is both warranted and past the floor.
  const reportMyCar = useCallback((car: RaceCarInput) => {
    carRef.current = car;

    const activeCode = codeRef.current;
    const activeUser = userRef.current;

    // Only broadcast while actually racing online and not yet finished. The
    // finished snapshot is owned by claimFinish; never let a routine broadcast
    // (which writes finished:false) race ahead of or undo it.
    if (
      !db ||
      !activeCode ||
      !activeUser ||
      statusRef.current !== 'racing' ||
      finishedRef.current ||
      car.finished
    ) {
      return;
    }

    const now = Date.now();
    // Baseline "no prior write" at the start line, so a car parked at 0/0 writes
    // nothing until it moves — and the first real movement still writes right away.
    const last = lastBroadcastRef.current ?? { at: 0, position: 0, velocity: 0 };

    const positionDelta = Math.abs(car.position - last.position);
    const velocityDelta = Math.abs(car.velocity - last.velocity);
    const changedMeaningfully =
      positionDelta >= POSITION_EPSILON || velocityDelta >= VELOCITY_EPSILON;
    const sinceLast = now - last.at;
    const bigSwing = velocityDelta >= BIG_VELOCITY_DELTA && sinceLast >= IMMEDIATE_EVENT_FLOOR_MS;

    // Steady cadence (meaningful change past the min interval) OR a big swing that
    // jumps the queue (subject only to the tiny floor).
    if (!((changedMeaningfully && sinceLast >= MIN_BROADCAST_INTERVAL_MS) || bigSwing)) {
      return;
    }

    lastBroadcastRef.current = { at: now, position: car.position, velocity: car.velocity };

    void writePlayerSnapshot(db, activeCode, {
      uid: activeUser.uid,
      displayName: resolveDisplayName(activeUser),
      position: car.position,
      velocity: car.velocity,
      finished: false,
      finishedAt: null,
    }).catch(() => {
      // Best-effort: the next frame's sample supersedes a dropped write.
    });
  }, []);

  const claimFinish = useCallback(
    async (finishedAt?: number): Promise<void> => {
      if (!db || !code || !user) {
        return;
      }

      // Stop routine broadcasts so none can overwrite the finished doc afterwards.
      finishedRef.current = true;

      const car = carRef.current;
      // Prefer the caller's crossing time, then the car's finishedAt, then now.
      const stampedAt = finishedAt ?? car?.finishedAt ?? Date.now();

      try {
        await writePlayerSnapshot(db, code, {
          uid: user.uid,
          displayName: resolveDisplayName(user),
          position: car?.position ?? 0,
          velocity: car?.velocity ?? 0,
          finished: true,
          finishedAt: stampedAt,
        });
        await claimWinner(db, code, user.uid);
      } catch (caught) {
        setError(toErrorMessage(caught, 'Could not report your finish.'));
      }
    },
    [code, user],
  );

  return {
    match,
    me,
    opponents,
    players,
    participants,
    isHost,
    status,
    error,
    createMatch,
    joinMatch,
    startRace,
    reportMyCar,
    claimFinish,
  };
}
