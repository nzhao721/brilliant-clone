import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { auth } from '../lib/firebase';
import {
  normalizeCloudLeaderboardEntry,
  resolveLeaderboardDisplayName,
  type LeaderboardEntry,
} from './leaderboardData';

// Leaderboard — online (Firestore) data layer.
//
// Mirrors the conventions in src/lessons/firestoreProgress.ts and
// src/race/raceMatch.ts: every network helper takes the `Firestore` instance as
// its first argument and documents are defensively normalized on the way in
// (via normalizeCloudLeaderboardEntry, which lives in the pure data module so it
// stays unit-testable while Firebase is disabled in tests).
//
// Data model:
//   leaderboard/{uid} -> { uid, displayName, totalXp, updatedAt }

const leaderboardCollection = 'leaderboard';

// How many real rows to pull for ranking. Larger than the displayed top-N so a
// viewer who sits just outside the visible window still gets an accurate rank.
export const leaderboardFetchLimit = 50;

// Keep these aligned with the firestore.rules validators for `leaderboard/{uid}`
// so a clamped client write always satisfies the rules.
const maxLeaderboardXp = 1_000_000;
const maxLeaderboardNameLength = 80;

function clampLeaderboardName(name: string): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return (trimmed || 'Learner').slice(0, maxLeaderboardNameLength);
}

function clampLeaderboardXp(totalXp: number): number {
  if (!Number.isFinite(totalXp) || totalXp <= 0) {
    return 0;
  }

  return Math.min(maxLeaderboardXp, Math.floor(totalXp));
}

/**
 * Upserts the signed-in user's `leaderboard/{uid}` row. Overwrites the whole
 * (4-field) doc each time so it never accumulates stray fields and always sets a
 * fresh `updatedAt == request.time`, satisfying the security rules. Values are
 * clamped to the rule-validated ranges so a legitimate write can't be rejected.
 */
export async function upsertLeaderboardEntry(
  db: Firestore,
  { uid, displayName, totalXp }: { uid: string; displayName: string; totalXp: number },
): Promise<void> {
  await setDoc(doc(db, leaderboardCollection, uid), {
    uid,
    displayName: clampLeaderboardName(displayName),
    totalXp: clampLeaderboardXp(totalXp),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Convenience wrapper used by the progress-save path: resolves the viewer's
 * leaderboard display name from the live auth user (the same source the read
 * side uses) and upserts their row with the supplied total XP.
 */
export async function syncLeaderboardEntry(
  db: Firestore,
  uid: string,
  totalXp: number,
): Promise<void> {
  const displayName = resolveLeaderboardDisplayName(auth?.currentUser ?? null);
  await upsertLeaderboardEntry(db, { uid, displayName, totalXp });
}

/**
 * Fetches the public profile rows for a specific set of uids (one direct
 * `leaderboard/{uid}` get each, run in parallel). Missing rows are skipped, so a
 * member who has never synced XP simply doesn't appear yet. Used to build a
 * per-class leaderboard from a class's member list WITHOUT duplicating XP into
 * the class docs — the `leaderboard/{uid}` doc stays the single source of XP
 * truth. Reads require auth (see firestore.rules). Order is not guaranteed; the
 * pure ranking layer (buildCloudLeaderboard) sorts by XP afterward.
 */
export async function getLeaderboardEntriesByIds(
  db: Firestore,
  uids: string[],
): Promise<LeaderboardEntry[]> {
  const uniqueUids = Array.from(new Set(uids.filter((uid) => typeof uid === 'string' && uid)));

  const snapshots = await Promise.all(
    uniqueUids.map((uid) => getDoc(doc(db, leaderboardCollection, uid))),
  );

  const entries: LeaderboardEntry[] = [];

  for (const snapshot of snapshots) {
    if (!snapshot.exists()) {
      continue;
    }

    const entry = normalizeCloudLeaderboardEntry(snapshot.id, snapshot.data());

    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * Live-subscribes to the top-`topN` rows ordered by XP (desc). Normalizes each
 * doc and calls `onEntries` with the (possibly empty) list on every change.
 * Calls `onError` if the listener fails (e.g. offline / permission), letting the
 * hook fall back gracefully. Returns the unsubscribe fn.
 */
export function subscribeLeaderboard(
  db: Firestore,
  topN: number,
  onEntries: (entries: LeaderboardEntry[]) => void,
  onError?: () => void,
): () => void {
  const leaderboardQuery = query(
    collection(db, leaderboardCollection),
    orderBy('totalXp', 'desc'),
    limit(topN),
  );

  return onSnapshot(
    leaderboardQuery,
    (snapshot) => {
      const entries: LeaderboardEntry[] = [];

      for (const docSnap of snapshot.docs) {
        const entry = normalizeCloudLeaderboardEntry(docSnap.id, docSnap.data());

        if (entry) {
          entries.push(entry);
        }
      }

      onEntries(entries);
    },
    () => {
      onError?.();
    },
  );
}
