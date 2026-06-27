import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Classes — online (Firestore) data layer.
//
// Mirrors the conventions in src/lessons/firestoreProgress.ts,
// src/race/raceMatch.ts, and src/leaderboard/leaderboardFirestore.ts: every
// network helper takes the `Firestore` instance as its first argument, reads are
// defensively normalized on the way in, and the pure helpers (code generation /
// validation / record normalization) carry NO Firebase dependency so they stay
// unit-testable while Firebase is disabled in test mode.
//
// Data model:
//   classes/{code} -> {
//     code: string,            // == the document id (an [A-Z0-9]{4,12} code)
//     name: string,            // 1..60 chars, set at creation, then immutable
//     ownerUid: string,        // creator's uid; immutable
//     memberUids: string[],    // membership list; only self can add/remove self
//     createdAt: timestamp,    // server time at creation; immutable
//     updatedAt: timestamp,    // server time of the last membership change
//   }
//
// A user's joined classes are found with a single-field `array-contains` query
// on `memberUids` (auto-indexed — no composite index needed). Per-class
// leaderboards reuse the existing public profile docs at `leaderboard/{uid}`
// (see src/leaderboard/leaderboardFirestore.ts) as the source of each member's
// lifetime XP + display name, so XP is NEVER duplicated into the class docs.
// ---------------------------------------------------------------------------

const classesCollection = 'classes';

// Unambiguous, uppercase alphabet for GENERATED codes: excludes I, L, O and the
// digits 0/1 so a shared class code can't be misread/mistyped. Custom codes the
// user types may use any of A–Z/0–9 (see isValidClassCodeFormat).
export const CLASS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Length bounds for a class code. Custom codes are validated against this range;
// generated codes are always GENERATED_CLASS_CODE_LENGTH characters.
export const CLASS_CODE_MIN_LENGTH = 4;
export const CLASS_CODE_MAX_LENGTH = 12;
export const GENERATED_CLASS_CODE_LENGTH = 6;

// A class name is bounded so the doc stays small and the rules can validate it.
export const MAX_CLASS_NAME_LENGTH = 60;
// Hard cap on members so the `memberUids` array (and the per-class leaderboard
// fan-out read) stays bounded. Kept in sync with the firestore.rules validator.
export const MAX_CLASS_MEMBERS = 200;

// How many times to retry a random code before giving up (collisions are
// astronomically unlikely at 31^6 combinations, so this is just a safety net).
const RANDOM_CODE_MAX_ATTEMPTS = 8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClassRecord = {
  code: string;
  name: string;
  ownerUid: string;
  memberUids: string[];
  memberCount: number;
  /** Epoch millis of creation, or null when unset/unresolved (pending write). */
  createdAtMillis: number | null;
};

export type CreateClassInput = {
  ownerUid: string;
  /** Optional user-typed code. When omitted, a unique random code is generated. */
  customCode?: string;
  /** Optional class name; defaults to a friendly label derived from the code. */
  name?: string;
};

export type JoinClassInput = {
  uid: string;
  code: string;
};

export type CreateClassResult =
  | { ok: true; record: ClassRecord }
  | {
      ok: false;
      reason: 'invalid-code' | 'code-taken' | 'generation-failed' | 'error';
      message: string;
    };

export type JoinClassResult =
  | { ok: true; record: ClassRecord; alreadyMember: boolean }
  | { ok: false; reason: 'invalid-code' | 'not-found' | 'error'; message: string };

export type LeaveClassResult =
  | { ok: true; wasMember: boolean }
  | { ok: false; reason: 'not-found' | 'error'; message: string };

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested; no Firebase dependency)
// ---------------------------------------------------------------------------

/**
 * Uniformly-distributed integer in [0, maxExclusive). Prefers crypto for
 * unguessable codes (the code is the capability needed to join), falling back to
 * Math.random where webcrypto is unavailable. Rejection sampling avoids the
 * modulo bias a naive `% maxExclusive` would introduce.
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

/** A fresh GENERATED_CLASS_CODE_LENGTH-char code from the unambiguous alphabet. */
export function generateClassCode(): string {
  let code = '';
  for (let index = 0; index < GENERATED_CLASS_CODE_LENGTH; index += 1) {
    code += CLASS_CODE_ALPHABET[randomInt(CLASS_CODE_ALPHABET.length)];
  }

  return code;
}

/**
 * Canonicalizes a user-typed code: uppercases and strips every character that
 * isn't A–Z or 0–9 (so "abcd-1234" / "abcd 1234" both become "ABCD1234"). The
 * result still needs isValidClassCodeFormat to bound its length.
 */
export function normalizeClassCode(rawCode: string): string {
  return (typeof rawCode === 'string' ? rawCode : '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** True when `code` is 4–12 chars of A–Z/0–9 (matches the firestore.rules regex). */
export function isValidClassCodeFormat(code: string): boolean {
  return (
    typeof code === 'string' &&
    code.length >= CLASS_CODE_MIN_LENGTH &&
    code.length <= CLASS_CODE_MAX_LENGTH &&
    /^[A-Z0-9]+$/.test(code)
  );
}

/**
 * Trims/length-caps a class name, falling back to a friendly default derived
 * from the code when blank. Always returns a non-empty 1..MAX_CLASS_NAME_LENGTH
 * string so the create write satisfies the rules.
 */
export function normalizeClassName(rawName: string | undefined, code: string): string {
  const trimmed = (typeof rawName === 'string' ? rawName : '').trim();
  const fallback = `Class ${code}`;
  return (trimmed || fallback).slice(0, MAX_CLASS_NAME_LENGTH);
}

function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
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

/**
 * Defensively normalizes a `classes/{code}` document into a ClassRecord. The doc
 * id is authoritative for `code`; member uids are de-duplicated; the name falls
 * back to a friendly default. Mirrors the firestoreProgress/raceMatch
 * normalizers so a garbled/partial doc can never crash a consumer.
 */
export function normalizeClassRecord(code: string, value: unknown): ClassRecord {
  const data = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const memberUids = Array.from(new Set(toStringList(data.memberUids)));
  const rawName = typeof data.name === 'string' ? data.name.trim() : '';

  return {
    code,
    name: (rawName || `Class ${code}`).slice(0, MAX_CLASS_NAME_LENGTH),
    ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : '',
    memberUids,
    memberCount: memberUids.length,
    createdAtMillis: toMillis(data.createdAt),
  };
}

// ---------------------------------------------------------------------------
// Firestore document references
// ---------------------------------------------------------------------------

function classDocRef(db: Firestore, code: string) {
  return doc(db, classesCollection, code);
}

function toUserMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

/**
 * Atomically creates `classes/{code}` IFF it does not already exist. Returns
 * true when the doc was created, false when the code is already taken. The
 * transaction makes the existence check + write atomic so two simultaneous
 * creators of the same custom code can't both succeed (the loser sees false).
 */
async function tryCreateClassDoc(
  db: Firestore,
  code: string,
  ownerUid: string,
  name: string,
): Promise<boolean> {
  return runTransaction(db, async (transaction) => {
    const ref = classDocRef(db, code);
    const snapshot = await transaction.get(ref);

    if (snapshot.exists()) {
      return false;
    }

    transaction.set(ref, {
      code,
      name,
      ownerUid,
      memberUids: [ownerUid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return true;
  });
}

/**
 * Creates a class the signed-in user owns and auto-joins. With a custom code we
 * validate the format and reject a code that's already taken; without one we
 * generate random codes and retry until a free one is found. Returns a typed
 * result so the UI can show a precise message (bad format / taken / etc.).
 */
export async function createClass(
  db: Firestore,
  { ownerUid, customCode, name }: CreateClassInput,
): Promise<CreateClassResult> {
  try {
    if (typeof customCode === 'string' && customCode.trim()) {
      const code = normalizeClassCode(customCode);

      if (!isValidClassCodeFormat(code)) {
        return {
          ok: false,
          reason: 'invalid-code',
          message: `A class code must be ${CLASS_CODE_MIN_LENGTH}–${CLASS_CODE_MAX_LENGTH} letters or numbers.`,
        };
      }

      const created = await tryCreateClassDoc(db, code, ownerUid, normalizeClassName(name, code));

      if (!created) {
        return {
          ok: false,
          reason: 'code-taken',
          message: `Class code "${code}" is already taken. Try another.`,
        };
      }

      return { ok: true, record: makeFreshRecord(code, ownerUid, normalizeClassName(name, code)) };
    }

    // No custom code: generate a unique random one, retrying on the (extremely
    // rare) collision until we find a free code or exhaust our attempts.
    for (let attempt = 0; attempt < RANDOM_CODE_MAX_ATTEMPTS; attempt += 1) {
      const code = generateClassCode();
      const className = normalizeClassName(name, code);
      const created = await tryCreateClassDoc(db, code, ownerUid, className);

      if (created) {
        return { ok: true, record: makeFreshRecord(code, ownerUid, className) };
      }
    }

    return {
      ok: false,
      reason: 'generation-failed',
      message: 'Could not generate a unique class code. Please try again.',
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'error',
      message: toUserMessage(error, 'Could not create the class. Please try again.'),
    };
  }
}

/** Builds the ClassRecord for a freshly-created class (createdAt resolves later). */
function makeFreshRecord(code: string, ownerUid: string, name: string): ClassRecord {
  return {
    code,
    name,
    ownerUid,
    memberUids: [ownerUid],
    memberCount: 1,
    createdAtMillis: null,
  };
}

/**
 * Joins an existing class by code. Validates the code format, then transactionally
 * confirms the class exists and adds the caller to `memberUids` (idempotently —
 * re-joining a class you're already in is a no-op that still resolves ok). Throws
 * nothing: returns a typed result the UI can show (bad format / not found).
 */
export async function joinClass(
  db: Firestore,
  { uid, code: rawCode }: JoinClassInput,
): Promise<JoinClassResult> {
  const code = normalizeClassCode(rawCode);

  if (!isValidClassCodeFormat(code)) {
    return {
      ok: false,
      reason: 'invalid-code',
      message: 'Enter a valid class code (4–12 letters or numbers).',
    };
  }

  try {
    const result = await runTransaction(db, async (transaction) => {
      const ref = classDocRef(db, code);
      const snapshot = await transaction.get(ref);

      if (!snapshot.exists()) {
        return { found: false as const };
      }

      const record = normalizeClassRecord(code, snapshot.data());
      const alreadyMember = record.memberUids.includes(uid);

      // Idempotent: only issue the membership write when we're not already in
      // (the rules' join validator requires the array to grow by exactly self).
      if (!alreadyMember) {
        transaction.update(ref, {
          memberUids: arrayUnion(uid),
          updatedAt: serverTimestamp(),
        });
      }

      return { found: true as const, record, alreadyMember };
    });

    if (!result.found) {
      return {
        ok: false,
        reason: 'not-found',
        message: `No class found with code "${code}".`,
      };
    }

    // Reflect the just-added membership in the returned record so the UI updates
    // immediately without waiting for the live query to round-trip.
    const memberUids = result.alreadyMember
      ? result.record.memberUids
      : Array.from(new Set([...result.record.memberUids, uid]));

    return {
      ok: true,
      alreadyMember: result.alreadyMember,
      record: { ...result.record, memberUids, memberCount: memberUids.length },
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'error',
      message: toUserMessage(error, 'Could not join the class. Please try again.'),
    };
  }
}

/**
 * Removes the caller from a class's `memberUids` (idempotent: leaving a class
 * you're not in is a no-op). The class doc itself is left intact even if it
 * becomes empty. Returns a typed result.
 */
export async function leaveClass(
  db: Firestore,
  { uid, code: rawCode }: JoinClassInput,
): Promise<LeaveClassResult> {
  const code = normalizeClassCode(rawCode);

  try {
    const result = await runTransaction(db, async (transaction) => {
      const ref = classDocRef(db, code);
      const snapshot = await transaction.get(ref);

      if (!snapshot.exists()) {
        return { found: false as const };
      }

      const record = normalizeClassRecord(code, snapshot.data());
      const wasMember = record.memberUids.includes(uid);

      if (wasMember) {
        transaction.update(ref, {
          memberUids: arrayRemove(uid),
          updatedAt: serverTimestamp(),
        });
      }

      return { found: true as const, wasMember };
    });

    if (!result.found) {
      return { ok: false, reason: 'not-found', message: `No class found with code "${code}".` };
    }

    return { ok: true, wasMember: result.wasMember };
  } catch (error) {
    return {
      ok: false,
      reason: 'error',
      message: toUserMessage(error, 'Could not leave the class. Please try again.'),
    };
  }
}

/** One-shot read of a single class by code (null when missing). */
export async function getClass(db: Firestore, rawCode: string): Promise<ClassRecord | null> {
  const code = normalizeClassCode(rawCode);
  const snapshot = await getDoc(classDocRef(db, code));
  return snapshot.exists() ? normalizeClassRecord(code, snapshot.data()) : null;
}

/**
 * One-shot read of every class the user belongs to via a single-field
 * `array-contains` query (auto-indexed). Sorted by name for a stable UI order.
 */
export async function getJoinedClasses(db: Firestore, uid: string): Promise<ClassRecord[]> {
  const snapshot = await getDocs(
    query(collection(db, classesCollection), where('memberUids', 'array-contains', uid)),
  );

  return snapshot.docs
    .map((classDoc) => normalizeClassRecord(classDoc.id, classDoc.data()))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Live-subscribes to the classes the user belongs to. Calls `onClasses` with the
 * (name-sorted) list on every change and `onError` if the listener fails (e.g.
 * offline / permission), letting the hook degrade gracefully. Returns the
 * unsubscribe fn.
 */
export function subscribeJoinedClasses(
  db: Firestore,
  uid: string,
  onClasses: (classes: ClassRecord[]) => void,
  onError?: () => void,
): () => void {
  return onSnapshot(
    query(collection(db, classesCollection), where('memberUids', 'array-contains', uid)),
    (snapshot) => {
      const classes = snapshot.docs
        .map((classDoc) => normalizeClassRecord(classDoc.id, classDoc.data()))
        .sort((left, right) => left.name.localeCompare(right.name));
      onClasses(classes);
    },
    () => {
      onError?.();
    },
  );
}

/**
 * Live-subscribes to a single class doc by code. Calls back with null when the
 * doc is missing or the listener errors. Returns the unsubscribe fn.
 */
export function subscribeClass(
  db: Firestore,
  rawCode: string,
  onClass: (record: ClassRecord | null) => void,
  onError?: () => void,
): () => void {
  const code = normalizeClassCode(rawCode);

  return onSnapshot(
    classDocRef(db, code),
    (snapshot) => {
      onClass(snapshot.exists() ? normalizeClassRecord(code, snapshot.data()) : null);
    },
    () => {
      onError?.();
    },
  );
}
