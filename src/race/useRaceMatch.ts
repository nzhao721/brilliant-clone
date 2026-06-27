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
// Each client is the sole authority over its OWN car. It simulates that car at
// 60fps (in the UI) and pushes the latest state here via `reportMyCar`, which
// broadcasts position/velocity to Firestore AS FAST AS PRACTICAL: it writes
// whenever the car meaningfully changes, throttled only to a short minimum
// interval (so Firestore's per-document write practicalities are respected),
// and writes IMMEDIATELY on a key event (a big speed swing such as a wrong-
// answer stall; the finish is written by `claimFinish`). EVERY other player's
// car is read from onSnapshot (already real-time), so a race supports any
// number (N) of players: `opponents` is the live list of all players except
// me. The lobby is host-controlled — the host calls `startRace()` to begin —
// and bot mode never touches this hook.
//
// Degrades gracefully: when `db` is null (Firebase unconfigured or test mode)
// `error` is set and create/join/start become no-ops.
// ---------------------------------------------------------------------------

// Broadcast cadence. Reads are real-time (onSnapshot); writes are the only
// thing we throttle, and only as much as Firestore's per-document write limits
// make sensible. ~150ms is a deliberate floor: well under the old 1s heartbeat
// (so the opponent tracks near-instantly) yet above Firestore's ~1 write/sec/doc
// sustained-cost sweet spot only by a small multiple, keeping a moving car to a
// handful of writes/sec instead of 60. A car that is not meaningfully moving
// writes nothing at all.
const MIN_BROADCAST_INTERVAL_MS = 150;
// Hard floor for IMMEDIATE key-event writes so even a pathological run of big
// swings can't write every frame; key events are physically rare (discrete), so
// in practice this never bites.
const IMMEDIATE_EVENT_FLOOR_MS = 50;
// Below these deltas the car hasn't meaningfully changed since the last write,
// so we skip it (e.g. parked at the line, or coasting to a near-stop). Metres /
// (m/s); both tiny relative to the 2500 m track and the ~112 m/s top speed.
const POSITION_EPSILON = 0.5;
const VELOCITY_EPSILON = 0.5;
// A frame-to-frame velocity change this large is a discrete event (a wrong-
// answer stall zeroing a cruise, a collision), not normal driving — normal
// accel/drag move velocity well under 1 m/s per frame — so we broadcast it
// immediately instead of waiting for the next cadence tick.
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

export type CreateMatchInput = {
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
  /**
   * Every OTHER player's live snapshot (all players except me), ordered by join
   * order (host first) so colours/lanes stay stable across snapshots. Empty
   * until opponents appear.
   */
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
  /**
   * Joins an existing race by code; resolves to `true` on success and `false` on
   * failure (also surfacing the reason via `error`), so callers can react to a
   * failed join without racing the hook's async `error` state.
   */
  joinMatch: (code: string) => Promise<boolean>;
  /** Host-only: starts the race (waiting -> racing); surfaces failures via `error`. */
  startRace: () => Promise<void>;
  /**
   * Hands my car's latest state to the hook every frame. The hook broadcasts it
   * to Firestore as fast as practical (throttled to a short minimum interval,
   * immediate on a big speed swing); a not-meaningfully-moving car writes nothing.
   */
  reportMyCar: (car: RaceCarInput) => void;
  /**
   * Writes my final snapshot (finished) then atomically claims the win, both
   * IMMEDIATELY (never waiting on the broadcast cadence). `finishedAt` lets the
   * caller stamp the exact crossing time it transitioned the UI on, so the
   * authoritative earliest-finisher comparison matches what the player saw.
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

  // Latest car state from the UI's rAF loop. A ref so 60fps updates never
  // trigger re-renders. `finishedRef` short-circuits broadcasting the instant we
  // claim a finish, before the snapshot round-trips. `lastBroadcastRef` is the
  // last state we actually wrote (with its timestamp), powering the throttle in
  // `reportMyCar`.
  const carRef = useRef<RaceCarInput | null>(null);
  const finishedRef = useRef(false);
  const lastBroadcastRef = useRef<BroadcastSample | null>(null);

  const uid = user?.uid ?? null;

  // Mirrors of the values `reportMyCar` (a stable, per-frame callback) needs, so
  // it can broadcast without being rebuilt — and thus without the rAF loop in
  // RaceView re-subscribing — every time the code/user/status changes.
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
  // All other players, ordered by their position in `participants` (host first,
  // then join order) so each opponent keeps a stable slot — and therefore a
  // stable colour/lane — even as the players subcollection snapshot reorders.
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

  // Subscribe to the match doc + players subcollection for the active code.
  // Resetting local state on code change avoids flashing a previous race.
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

  // Called every frame by RaceView. Stashes the latest car state, then broadcasts
  // it to Firestore as fast as practical: on a steady ~150ms cadence while the
  // car meaningfully changes, and IMMEDIATELY on a big speed swing. A stable
  // callback (reads code/user/status from refs) so the 60fps loop never restarts
  // it. Deliberately no setInterval: there is no fixed waiting — a write happens
  // the moment it is both warranted (changed) and allowed (past the short floor).
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
    // Treat "no prior write" as a baseline at the start line, so a car sitting at
    // 0/0 (e.g. answering before its first move) broadcasts nothing until it
    // actually moves — and the FIRST real movement still writes right away.
    const last = lastBroadcastRef.current ?? { at: 0, position: 0, velocity: 0 };

    const positionDelta = Math.abs(car.position - last.position);
    const velocityDelta = Math.abs(car.velocity - last.velocity);
    const changedMeaningfully =
      positionDelta >= POSITION_EPSILON || velocityDelta >= VELOCITY_EPSILON;
    const sinceLast = now - last.at;
    const bigSwing = velocityDelta >= BIG_VELOCITY_DELTA && sinceLast >= IMMEDIATE_EVENT_FLOOR_MS;

    // Steady cadence: a meaningful change once the min interval has elapsed.
    // Immediate path: a big swing jumps the queue (subject only to the tiny floor).
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
      // Best-effort broadcast: ignore transient write errors (the next frame's
      // sample supersedes this one anyway).
    });
  }, []);

  const claimFinish = useCallback(
    async (finishedAt?: number): Promise<void> => {
      if (!db || !code || !user) {
        return;
      }

      // Stop routine broadcasts immediately so none can overwrite the finished
      // doc with a finished:false sample after this point.
      finishedRef.current = true;

      const car = carRef.current;
      // Prefer the caller's crossing time (the exact instant the UI transitioned
      // on), then the car's own finishedAt, then now — so the authoritative
      // earliest-finisher comparison matches what the player actually saw.
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
