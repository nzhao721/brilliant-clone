import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Slipstream — online (Firestore) data layer. Every network helper takes the
// `Firestore` instance as its first argument and reads are defensively normalized;
// pure helpers (generateRaceCode, resolveWinner) carry no Firebase dependency so
// they stay unit-testable while Firebase is disabled in test mode.
//
// Online races support any number of players. The lobby is host-controlled: the
// host creates a room (`waiting`), anyone may join by code while it is `waiting`,
// and the host starts the race (`waiting` -> `racing`). No auto-start, no mid-race
// joining; the shared `seed`/`raceDistance` keep every track + question sequence
// identical, and `resolveWinner` ranks finishers by who crossed first.
//
// Data model:
//   raceMatches/{code}                -> the match doc (id IS the room code)
//   raceMatches/{code}/players/{uid}  -> one live-state doc per player
// ---------------------------------------------------------------------------

export type RaceStatus = 'waiting' | 'racing' | 'finished';

export type PlayerSnapshot = {
  uid: string;
  displayName: string;
  position: number;
  velocity: number;
  finished: boolean;
  finishedAt: number | null;
};

export type RaceMatch = {
  code: string;
  status: RaceStatus;
  seed: number;
  /**
   * Chapter pool both clients build their seeded question sequence from. An
   * EMPTY list is the sentinel for "the full question bank" — online races are
   * ungated, so they store `[]` and race the whole bank.
   */
  chapterIds: string[];
  raceDistance: number;
  hostUid: string;
  participants: string[];
  winnerUid: string | null;
};

export type CreateRaceMatchInput = {
  hostUid: string;
  hostName: string;
  seed: number;
  /** Chapter pool for the race; `[]` means the full question bank (see RaceMatch). */
  chapterIds: string[];
  raceDistance: number;
};

// Fallback finish line for a missing/garbled match doc. The real distance is
// supplied to createRaceMatch; this module deliberately doesn't import racePhysics
// so the data layer stays decoupled from the physics engine.
const DEFAULT_RACE_DISTANCE = 1000;

// Unambiguous, uppercase code alphabet: excludes I, L, O (and the digits 0, 1)
// so a shared room code can't be misread/mistyped between players.
export const RACE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const RACE_CODE_MIN_LENGTH = 5;
const RACE_CODE_MAX_LENGTH = 6;

const raceMatchesCollection = 'raceMatches';
const playersSubcollection = 'players';

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Uniformly-distributed integer in [0, maxExclusive). Prefers crypto for
 * unguessable room codes (falling back to Math.random); rejection sampling avoids
 * the modulo bias of a naive `% maxExclusive`.
 */
function randomInt(maxExclusive: number): number {
  const cryptoObj = globalThis.crypto;

  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const maxUint32 = 0xffffffff;
    const limit = maxUint32 - (maxUint32 % maxExclusive);
    const buffer = new Uint32Array(1);
    let value = 0;

    do {
      cryptoObj.getRandomValues(buffer);
      value = buffer[0];
    } while (value >= limit);

    return value % maxExclusive;
  }

  return Math.floor(Math.random() * maxExclusive);
}

/** A 5- or 6-character uppercase room code from the unambiguous alphabet. */
export function generateRaceCode(): string {
  const length =
    RACE_CODE_MIN_LENGTH + randomInt(RACE_CODE_MAX_LENGTH - RACE_CODE_MIN_LENGTH + 1);

  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += RACE_CODE_ALPHABET[randomInt(RACE_CODE_ALPHABET.length)];
  }

  return code;
}

/**
 * Winner = the earliest finisher (smallest `finishedAt`) among finished players,
 * or null when nobody has finished. Players flagged finished but missing a numeric
 * `finishedAt` are ignored. Pure.
 */
export function resolveWinner(players: PlayerSnapshot[]): string | null {
  let winnerUid: string | null = null;
  let earliest = Number.POSITIVE_INFINITY;

  for (const player of players) {
    if (!player.finished || typeof player.finishedAt !== 'number') {
      continue;
    }

    if (player.finishedAt < earliest) {
      earliest = player.finishedAt;
      winnerUid = player.uid;
    }
  }

  return winnerUid;
}

// ---------------------------------------------------------------------------
// Normalization (defensive reads, mirrors firestoreProgress.ts)
// ---------------------------------------------------------------------------

function toFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function hasToMillis(value: unknown): value is { toMillis: () => number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  );
}

/** Coerce a Firestore Timestamp (or raw number) to epoch millis, else null. */
function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (hasToMillis(value)) {
    const millis = value.toMillis();
    return Number.isFinite(millis) ? millis : null;
  }

  return null;
}

function normalizeStatus(value: unknown): RaceStatus {
  return value === 'racing' || value === 'finished' ? value : 'waiting';
}

function toStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function normalizeRaceMatch(code: string, value: unknown): RaceMatch {
  const data = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const rawDistance = toFiniteNumber(data.raceDistance, DEFAULT_RACE_DISTANCE);

  return {
    code,
    status: normalizeStatus(data.status),
    seed: toFiniteNumber(data.seed),
    chapterIds: toStringList(data.chapterIds),
    raceDistance: rawDistance > 0 ? rawDistance : DEFAULT_RACE_DISTANCE,
    hostUid: typeof data.hostUid === 'string' ? data.hostUid : '',
    participants: toStringList(data.participants),
    winnerUid: typeof data.winnerUid === 'string' ? data.winnerUid : null,
  };
}

function normalizePlayerSnapshot(uid: string, value: unknown): PlayerSnapshot {
  const data = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    uid: typeof data.uid === 'string' && data.uid ? data.uid : uid,
    displayName: typeof data.displayName === 'string' ? data.displayName : '',
    position: toFiniteNumber(data.position),
    velocity: toFiniteNumber(data.velocity),
    finished: Boolean(data.finished),
    finishedAt: toMillis(data.finishedAt),
  };
}

// ---------------------------------------------------------------------------
// Firestore document references
// ---------------------------------------------------------------------------

function matchDocRef(db: Firestore, code: string) {
  return doc(db, raceMatchesCollection, code);
}

function playerDocRef(db: Firestore, code: string, uid: string) {
  return doc(db, raceMatchesCollection, code, playersSubcollection, uid);
}

function playersCollectionRef(db: Firestore, code: string) {
  return collection(db, raceMatchesCollection, code, playersSubcollection);
}

/** The fields every player doc starts with (position 0 at the start line). */
function initialPlayerDocData(uid: string, displayName: string) {
  return {
    uid,
    displayName,
    position: 0,
    velocity: 0,
    finished: false,
    finishedAt: null,
    lastUpdate: serverTimestamp(),
  };
}

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

/**
 * Creates a new match ('waiting') under a fresh code plus the host's player doc,
 * and returns the code to share. The host is the only participant until someone joins.
 */
export async function createRaceMatch(
  db: Firestore,
  { hostUid, hostName, seed, chapterIds, raceDistance }: CreateRaceMatchInput,
): Promise<string> {
  const code = generateRaceCode();

  await setDoc(matchDocRef(db, code), {
    status: 'waiting',
    seed,
    chapterIds,
    raceDistance,
    hostUid,
    participants: [hostUid],
    winnerUid: null,
    createdAt: serverTimestamp(),
  });

  await setDoc(playerDocRef(db, code, hostUid), initialPlayerDocData(hostUid, hostName));

  return code;
}

/**
 * Joins a match by appending myself to `participants` (via `arrayUnion`, so
 * concurrent joiners can't clobber the list) while it is still `waiting`, then
 * creating my player doc. Joining a `racing`/`finished` race throws; re-joining
 * one I'm already in just refreshes my player doc (a reconnect). Throws clear,
 * user-facing Errors.
 */
export async function joinRaceMatch(
  db: Firestore,
  code: string,
  uid: string,
  displayName: string,
): Promise<void> {
  const ref = matchDocRef(db, code);
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    throw new Error(`Race "${code}" was not found.`);
  }

  const match = normalizeRaceMatch(code, snapshot.data());
  const alreadyJoined = match.participants.includes(uid);

  if (!alreadyJoined) {
    if (match.status === 'finished') {
      throw new Error('This race has already finished.');
    }
    if (match.status === 'racing') {
      throw new Error('This race has already started.');
    }

    await updateDoc(ref, {
      participants: arrayUnion(uid),
    });
  }

  await setDoc(playerDocRef(db, code, uid), initialPlayerDocData(uid, displayName), {
    merge: true,
  });
}

/**
 * Host-only: starts a still-`waiting` room, flipping it to `racing`. Runs in a
 * transaction so the host check and the single flip are atomic — a duplicate click
 * is an idempotent no-op and a non-host can't sneak a start through. Throws clear,
 * user-facing Errors.
 */
export async function startRaceMatch(
  db: Firestore,
  code: string,
  hostUid: string,
): Promise<void> {
  const ref = matchDocRef(db, code);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists()) {
      throw new Error(`Race "${code}" was not found.`);
    }

    const match = normalizeRaceMatch(code, snapshot.data());

    if (match.hostUid !== hostUid) {
      throw new Error('Only the host can start the race.');
    }

    if (match.status === 'racing') {
      // Already started — treat a duplicate start as a harmless no-op.
      return;
    }

    if (match.status !== 'waiting') {
      throw new Error('This race can no longer be started.');
    }

    transaction.update(ref, {
      status: 'racing',
      startedAt: serverTimestamp(),
    });
  });
}

/** Broadcasts my car's latest state. Merge-write so repeated calls never clobber other fields. */
export async function writePlayerSnapshot(
  db: Firestore,
  code: string,
  snapshot: PlayerSnapshot,
): Promise<void> {
  await setDoc(
    playerDocRef(db, code, snapshot.uid),
    {
      uid: snapshot.uid,
      displayName: snapshot.displayName,
      position: snapshot.position,
      velocity: snapshot.velocity,
      finished: snapshot.finished,
      finishedAt: snapshot.finishedAt,
      lastUpdate: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Claims victory for `uid` and finishes the match, but only if no winner is
 * recorded yet. The transaction makes "first finisher wins" atomic so a
 * near-simultaneous finish can't record two winners.
 */
export async function claimWinner(db: Firestore, code: string, uid: string): Promise<void> {
  const ref = matchDocRef(db, code);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists()) {
      throw new Error(`Race "${code}" was not found.`);
    }

    if (snapshot.data().winnerUid != null) {
      // Someone already claimed it — leave the existing winner untouched.
      return;
    }

    transaction.update(ref, {
      winnerUid: uid,
      status: 'finished',
    });
  });
}

/**
 * Live-subscribes to the match doc. Calls back with null when the doc is
 * missing or the listener errors. Returns the unsubscribe fn.
 */
export function subscribeMatch(
  db: Firestore,
  code: string,
  cb: (match: RaceMatch | null) => void,
): () => void {
  return onSnapshot(
    matchDocRef(db, code),
    (snapshot) => {
      cb(snapshot.exists() ? normalizeRaceMatch(code, snapshot.data()) : null);
    },
    () => {
      cb(null);
    },
  );
}

/**
 * Live-subscribes to the players subcollection, normalizing each doc. Calls
 * back with an empty list on error. Returns the unsubscribe fn.
 */
export function subscribePlayers(
  db: Firestore,
  code: string,
  cb: (players: PlayerSnapshot[]) => void,
): () => void {
  return onSnapshot(
    playersCollectionRef(db, code),
    (snapshot) => {
      cb(snapshot.docs.map((playerDoc) => normalizePlayerSnapshot(playerDoc.id, playerDoc.data())));
    },
    () => {
      cb([]);
    },
  );
}
