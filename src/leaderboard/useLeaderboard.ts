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

type LeaderboardStatus = 'loading' | 'ready' | 'error';

export type { RankedLeaderboardEntry } from './leaderboardData';

export type UseLeaderboardResult = {
  status: LeaderboardStatus;
  /** Top-N entries ordered by XP (highest first), each tagged with its rank. */
  entries: RankedLeaderboardEntry[];
  /** The signed-in user's rank across the whole field. */
  currentUserRank: number | null;
  /**
   * The viewer's row when they rank BELOW the fetched window (so the page can pin
   * it beneath the list). `null` when they already appear in `entries`.
   */
  currentUserOutsideTop: RankedLeaderboardEntry | null;
  topN: number;
};

/**
 * Builds the leaderboard, preferring the real cross-user Firestore board and
 * degrading to the local seeded board. With Firestore + a signed-in user it
 * live-subscribes to the top rows and merges the viewer's own live XP over their
 * (possibly stale) cloud row, showing ONLY real users. Otherwise (unconfigured,
 * signed out, or listener error) it falls back to the seeded board.
 */
export function useLeaderboard(): UseLeaderboardResult {
  const { user } = useAuth();
  const { progress } = useLessonProgress(lessons, user?.uid);

  const currentUserName = resolveLeaderboardDisplayName(user);
  const currentUserId = user?.uid ?? null;

  /* `null` until the first snapshot (distinguishes "loading" from empty);
   * `cloudError` flips to the local fallback. */
  const [cloudEntries, setCloudEntries] = useState<LeaderboardEntry[] | null>(null);
  const [cloudError, setCloudError] = useState(false);

  /* Reads require auth, so subscribe only with both a Firestore instance and a
   * signed-in user. */
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
