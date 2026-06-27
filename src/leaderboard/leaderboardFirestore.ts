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

/*
 * Leaderboard — online (Firestore) data layer. Every helper takes the `Firestore`
 * instance first; docs are normalized on the way in (via normalizeCloudLeaderboardEntry
 * in the pure data module).
 *
 * Data model: leaderboard/{uid} -> { uid, displayName, totalXp, updatedAt }
 */

const leaderboardCollection = 'leaderboard';

/* Rows pulled for ranking; larger than the displayed top-N so a viewer just
 * outside the window still gets an accurate rank. */
export const leaderboardFetchLimit = 50;

/* Keep aligned with the firestore.rules validators for `leaderboard/{uid}`. */
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
 * Upserts the viewer's `leaderboard/{uid}` row. Overwrites the whole 4-field doc
 * each time (no stray fields, fresh `updatedAt`), with values clamped to the
 * rule-validated ranges.
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
 * Wrapper for the progress-save path: resolves the viewer's display name from the
 * live auth user and upserts their row with the supplied total XP.
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
 * Fetches the rows for a set of uids (one `leaderboard/{uid}` get each, in
 * parallel); missing rows are skipped. Lets a per-class board read from a member
 * list without duplicating XP — `leaderboard/{uid}` stays the source of truth.
 * Order isn't guaranteed; buildCloudLeaderboard sorts afterward.
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
 * Live-subscribes to the top-`topN` rows by XP (desc), calling `onEntries` with
 * the normalized list on every change and `onError` on failure (offline /
 * permission). Returns the unsubscribe fn.
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
