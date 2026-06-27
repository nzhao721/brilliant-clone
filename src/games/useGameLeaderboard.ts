import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { db } from '../lib/firebase';
import {
  buildCloudLeaderboard,
  resolveLeaderboardDisplayName,
  type LeaderboardEntry,
} from '../leaderboard/leaderboardData';
import type { UseLeaderboardResult } from '../leaderboard/useLeaderboard';
import {
  gameLeaderboardFetchLimit,
  gameLeaderboardTopN,
  readGameBest,
  subscribeGameLeaderboard,
} from './gameScores';

// ---------------------------------------------------------------------------
// useGameLeaderboard — the GLOBAL per-game cloud leaderboard hook.
//
// Mirrors src/leaderboard/useLeaderboard.ts: when Firestore is configured AND a
// user is signed in, it live-subscribes to the game's top rows (ordered by score
// desc) and ranks them with the SAME pure logic as the XP boards
// (buildCloudLeaderboard), merging the viewer's OWN live best (the larger of
// their local device best and the current run) over any stale cloud row. Returns
// the UseLeaderboardResult shape so <LeaderboardList> renders it.
//
// Degrades gracefully (NO seeded competitors anymore):
//   • Firestore unconfigured → available=false (caller shows the local best).
//   • signed out             → signedIn=false (caller shows a sign-in prompt).
//   • listener error/offline → status='error' (caller shows the error card).
// ---------------------------------------------------------------------------

export type UseGameLeaderboardResult = UseLeaderboardResult & {
  /** True when a user is signed in (cloud reads/writes require auth). */
  signedIn: boolean;
  /** True when Firestore is configured (cloud features usable). */
  available: boolean;
  /** The viewer's LOCAL device best for this game (signed-out fallback). */
  localBest: number | null;
};

function normalizeHighlight(score: number | undefined): number {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
    return 0;
  }
  return Math.floor(score);
}

export function useGameLeaderboard(
  gameId: string,
  currentScore?: number,
): UseGameLeaderboardResult {
  const { user } = useAuth();

  const currentUserName = resolveLeaderboardDisplayName(user);
  const currentUserId = user?.uid ?? null;
  const available = Boolean(db);
  const signedIn = Boolean(currentUserId);
  const localBest = readGameBest(gameId);

  // `null` until the first snapshot arrives (distinguishes loading from empty);
  // `cloudError` flips the board to an error state.
  const [cloudEntries, setCloudEntries] = useState<LeaderboardEntry[] | null>(null);
  const [cloudError, setCloudError] = useState(false);

  // Reads require auth (see firestore.rules), so only subscribe with both a
  // Firestore instance and a signed-in user.
  useEffect(() => {
    if (!db || !currentUserId) {
      return undefined;
    }

    setCloudError(false);
    setCloudEntries(null);

    return subscribeGameLeaderboard(
      db,
      gameId,
      gameLeaderboardFetchLimit,
      (entries) => setCloudEntries(entries),
      () => setCloudError(true),
    );
  }, [gameId, currentUserId]);

  const cloudActive = available && signedIn;
  const useCloudData = cloudActive && !cloudError;

  // The viewer's live best: the larger of their local device best and the
  // just-finished run, so their row is never stale before the write round-trips.
  const liveBest = Math.max(localBest ?? 0, normalizeHighlight(currentScore));

  const board = buildCloudLeaderboard({
    realEntries: useCloudData ? cloudEntries ?? [] : [],
    currentUserId,
    currentUserXp: liveBest,
    currentUserName,
    topN: gameLeaderboardTopN,
  });

  let status: UseLeaderboardResult['status'] = 'ready';
  if (cloudActive && cloudError) {
    status = 'error';
  } else if (cloudActive && cloudEntries === null) {
    status = 'loading';
  }

  return {
    status,
    entries: board.entries,
    currentUserRank: board.currentUserRank,
    currentUserOutsideTop: board.currentUserOutsideTop,
    topN: gameLeaderboardTopN,
    signedIn,
    available,
    localBest,
  };
}
