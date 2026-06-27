import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { lessons } from '../data/lessons';
import { db } from '../lib/firebase';
import { useLessonProgress } from '../lessons/lessonProgress';
import {
  buildCloudLeaderboard,
  buildRankedLeaderboard,
  leaderboardTopN,
  resolveLeaderboardDisplayName,
  type LeaderboardEntry,
  type RankedLeaderboardEntry,
} from './leaderboardData';
import { leaderboardFetchLimit, subscribeLeaderboard } from './leaderboardFirestore';

export type LeaderboardStatus = 'loading' | 'ready' | 'error';

export type { RankedLeaderboardEntry } from './leaderboardData';

export type UseLeaderboardResult = {
  status: LeaderboardStatus;
  /** Top-N entries ordered by XP (highest first), each tagged with its rank. */
  entries: RankedLeaderboardEntry[];
  /** The signed-in user's rank across the whole field. */
  currentUserRank: number | null;
  /**
   * The signed-in user's row when they rank BELOW the fetched window, so the
   * page can pin it beneath the list. `null` when they already appear in
   * `entries`.
   */
  currentUserOutsideTop: RankedLeaderboardEntry | null;
  topN: number;
};

/**
 * Builds the leaderboard, preferring the real cross-user board from Firestore
 * and degrading gracefully to a local seeded board.
 *
 * When Firestore is available AND the user is signed in, it live-subscribes to
 * the top rows ordered by XP, then merges the viewer's OWN live local XP over
 * any (possibly stale) cloud row so their standing is always current. This cloud
 * board shows ONLY real users — never seeded/fake competitors — so production is
 * truthful even when sparse (it may legitimately show just the viewer on a
 * brand-new board; see buildCloudLeaderboard).
 *
 * When Firestore is unconfigured (e.g. tests), the user is signed out, or the
 * live listener errors, it falls back to the original local-only seeded board so
 * the page always renders something sensible.
 */
export function useLeaderboard(): UseLeaderboardResult {
  const { user } = useAuth();
  const { progress } = useLessonProgress(lessons, user?.uid);

  const currentUserName = resolveLeaderboardDisplayName(user);
  const currentUserId = user?.uid ?? null;

  // `null` until the first snapshot arrives (distinguishes "loading" from a
  // genuinely empty board). `cloudError` flips us to the local fallback.
  const [cloudEntries, setCloudEntries] = useState<LeaderboardEntry[] | null>(null);
  const [cloudError, setCloudError] = useState(false);

  // Reads require auth (see firestore.rules), so only subscribe when both the
  // Firestore instance and a signed-in user are present.
  useEffect(() => {
    if (!db || !currentUserId) {
      return undefined;
    }

    setCloudError(false);
    setCloudEntries(null);

    return subscribeLeaderboard(
      db,
      leaderboardFetchLimit,
      (entries) => setCloudEntries(entries),
      () => setCloudError(true),
    );
  }, [currentUserId]);

  const useCloud = Boolean(db) && Boolean(currentUserId) && !cloudError;

  if (!useCloud) {
    // Local-only fallback: identical to the original seeded behavior.
    const local = buildRankedLeaderboard({
      currentUserXp: progress.totalXp,
      currentUserName,
    });

    return {
      status: 'ready',
      entries: local.entries,
      currentUserRank: local.currentUserRank,
      currentUserOutsideTop: local.currentUserOutsideTop,
      topN: leaderboardTopN,
    };
  }

  const cloud = buildCloudLeaderboard({
    realEntries: cloudEntries ?? [],
    currentUserId,
    currentUserXp: progress.totalXp,
    currentUserName,
    topN: leaderboardTopN,
  });

  return {
    // Still waiting on the first snapshot → loading; otherwise the live board.
    status: cloudEntries === null ? 'loading' : 'ready',
    entries: cloud.entries,
    currentUserRank: cloud.currentUserRank,
    currentUserOutsideTop: cloud.currentUserOutsideTop,
    topN: leaderboardTopN,
  };
}
