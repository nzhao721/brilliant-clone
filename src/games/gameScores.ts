import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type { LeaderboardEntry } from '../leaderboard/leaderboardData';

// ---------------------------------------------------------------------------
// Per-game high-score leaderboards — REAL Firestore cloud boards (global only).
//
// This replaces the former local-only seeded mock. Mirrors the conventions in
// src/leaderboard/leaderboardFirestore.ts and src/classes/classData.ts: every
// network helper takes the `Firestore` instance as its first argument, reads are
// defensively normalized on the way in, and the score value reuses the shared
// LeaderboardEntry shape (the entry's `xp` field carries the game SCORE) so the
// same pure ranking (buildCloudLeaderboard) and <LeaderboardList> used by the XP
// boards render game boards too.
//
// Data model (NO composite index — single-field auto-index on `score`):
//   gameScores/{gameId}/scores/{uid} -> { uid, displayName, score, updatedAt }
//
// The global top-N for a game is just:
//   query(scores, orderBy('score','desc'), limit(N))
//
// A small per-game LOCAL best is still kept in localStorage as a graceful
// fallback for signed-out / Firestore-unavailable play and to seed the viewer's
// own row before a cloud write round-trips. There are NO seeded/mock
// competitors anymore — boards show real users only.
// ---------------------------------------------------------------------------

const gameScoresCollection = 'gameScores';
const scoresSubcollection = 'scores';

// Default board size surfaced to the UI; the viewer is pinned below it when they
// rank lower (see buildCloudLeaderboard).
export const gameLeaderboardTopN = 10;

// How many real rows to pull for ranking — larger than the displayed top-N so a
// viewer who sits just outside the window still gets an accurate rank.
export const gameLeaderboardFetchLimit = 50;

// Keep aligned with the firestore.rules validator for game score docs.
const MAX_GAME_SCORE = 1_000_000_000;
const MAX_DISPLAY_NAME_LENGTH = 80;

// localStorage key namespace for the LOCAL personal best — one integer per game
// id, e.g. brilliant-clone.gamescores.snake = "48". (A legacy build stored a
// JSON array of every run; readGameBest collapses that to its max.)
export const gameScoreStorageKeyPrefix = 'brilliant-clone.gamescores.';

export function gameScoreStorageKey(gameId: string): string {
  return `${gameScoreStorageKeyPrefix}${gameId}`;
}

/**
 * Coerces a raw value to a storable score: a non-negative integer (floored),
 * clamped to MAX_GAME_SCORE. Non-finite / negative inputs return null so callers
 * can ignore them. Zero is a legitimate run result and is kept.
 */
export function normalizeScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.min(MAX_GAME_SCORE, Math.floor(value));
}

// ---------------------------------------------------------------------------
// Local personal best (fallback + viewer-row seed). No network.
// ---------------------------------------------------------------------------

/**
 * Reads a game's stored LOCAL personal best as a single non-negative integer, or
 * null when unset. Tolerates the legacy array store (collapsed to its max).
 */
export function readGameBest(gameId: string): number | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(gameScoreStorageKey(gameId));
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (Array.isArray(parsed)) {
    let best: number | null = null;
    for (const entry of parsed) {
      const normalized = normalizeScore(entry);
      if (normalized !== null && (best === null || normalized > best)) {
        best = normalized;
      }
    }
    return best;
  }

  return normalizeScore(parsed);
}

/**
 * Records one run's score as the game's LOCAL personal best, keeping only the
 * single best: stored value becomes max(currentBest, score). Returns the
 * resulting best (or the existing best when the run is invalid/worse). No-op
 * without a DOM.
 */
export function recordLocalGameBest(gameId: string, score: number): number | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const currentBest = readGameBest(gameId);
  const normalized = normalizeScore(score);
  if (normalized === null) {
    return currentBest;
  }

  const best = currentBest === null ? normalized : Math.max(currentBest, normalized);
  window.localStorage.setItem(gameScoreStorageKey(gameId), JSON.stringify(best));
  return best;
}

/**
 * Removes EVERY per-game LOCAL score store from localStorage (all keys under
 * {@link gameScoreStorageKeyPrefix}). Wired into the arcade's reset-progress flow.
 * No-op without a DOM. (Cloud bests are cleared separately by
 * {@link resetCloudGameScores}.)
 */
export function resetGameScores(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(gameScoreStorageKeyPrefix)) {
      keys.push(key);
    }
  }

  for (const key of keys) {
    window.localStorage.removeItem(key);
  }
}

// ---------------------------------------------------------------------------
// Firestore document references
// ---------------------------------------------------------------------------

function scoreDocRef(db: Firestore, gameId: string, uid: string) {
  return doc(db, gameScoresCollection, gameId, scoresSubcollection, uid);
}

function scoresCollectionRef(db: Firestore, gameId: string) {
  return collection(db, gameScoresCollection, gameId, scoresSubcollection);
}

function clampDisplayName(name: string): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return (trimmed || 'Learner').slice(0, MAX_DISPLAY_NAME_LENGTH);
}

/**
 * Normalizes one `gameScores/{gameId}/scores/{uid}` doc into a LeaderboardEntry,
 * mapping the game `score` onto the shared entry's `xp` field so it ranks with
 * the same pure logic as the XP boards. Defensive: floors/clamps the score,
 * trims/caps the name, returns null for an empty uid. Pure (no Firebase import).
 */
export function normalizeGameScoreEntry(uid: string, data: unknown): LeaderboardEntry | null {
  if (typeof uid !== 'string' || !uid) {
    return null;
  }

  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const rawName = typeof record.displayName === 'string' ? record.displayName.trim() : '';
  const displayName = (rawName || 'Learner').slice(0, MAX_DISPLAY_NAME_LENGTH);
  const score = normalizeScore(record.score) ?? 0;

  // Reuse the shared shape: `xp` carries the score for ranking/rendering.
  return { id: uid, displayName, xp: score };
}

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

/**
 * Upserts the signed-in user's best score for a game, writing ONLY when the run
 * beats their stored cloud best. The transaction makes the read-compare-write
 * atomic so a concurrent higher score can't be clobbered by a lower one, and it
 * guarantees the write is monotonically non-decreasing (satisfying the security
 * rule that an update's score must be >= the existing one). Overwrites the whole
 * 4-field doc so no stray fields accumulate.
 */
export async function recordGameScore(
  db: Firestore,
  gameId: string,
  { uid, displayName, score }: { uid: string; displayName: string; score: number },
): Promise<void> {
  const normalized = normalizeScore(score);
  if (normalized === null) {
    return;
  }

  const ref = scoreDocRef(db, gameId, uid);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists() ? normalizeScore(snapshot.data().score) : null;

    // Best-only: skip the write when it doesn't beat the stored best (also keeps
    // every update monotonically increasing for the security rule).
    if (existing !== null && normalized <= existing) {
      return;
    }

    transaction.set(ref, {
      uid,
      displayName: clampDisplayName(displayName),
      score: normalized,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Live-subscribes to a game's GLOBAL top-`topN` rows ordered by score (desc).
 * Normalizes each doc and calls `onEntries` with the (possibly empty) list on
 * every change; calls `onError` if the listener fails (e.g. offline / permission)
 * so the hook can degrade gracefully. Returns the unsubscribe fn.
 */
export function subscribeGameLeaderboard(
  db: Firestore,
  gameId: string,
  topN: number,
  onEntries: (entries: LeaderboardEntry[]) => void,
  onError?: () => void,
): () => void {
  const scoresQuery = query(
    scoresCollectionRef(db, gameId),
    orderBy('score', 'desc'),
    limit(topN),
  );

  return onSnapshot(
    scoresQuery,
    (snapshot) => {
      const entries: LeaderboardEntry[] = [];

      for (const scoreDoc of snapshot.docs) {
        const entry = normalizeGameScoreEntry(scoreDoc.id, scoreDoc.data());

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

/**
 * Deletes the user's own best-score doc for each of the supplied game ids. Used
 * by the reset-progress flow so resetting clears the player's CLOUD bests
 * alongside their local stores. Best-effort and parallel; rejections bubble to
 * the caller (which swallows them).
 */
export async function resetCloudGameScores(
  db: Firestore,
  uid: string,
  gameIds: string[],
): Promise<void> {
  await Promise.all(gameIds.map((gameId) => deleteDoc(scoreDocRef(db, gameId, uid))));
}
