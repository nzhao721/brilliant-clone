import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { lessons } from '../data/lessons';
import { db } from '../lib/firebase';
import {
  buildCloudLeaderboard,
  resolveLeaderboardDisplayName,
  type LeaderboardEntry,
} from '../leaderboard/leaderboardData';
import { getLeaderboardEntriesByIds } from '../leaderboard/leaderboardFirestore';
import type { UseLeaderboardResult } from '../leaderboard/useLeaderboard';
import { useLessonProgress } from '../lessons/lessonProgress';
import { MAX_CLASS_MEMBERS, subscribeClass, type ClassRecord } from './classData';

// useClassLeaderboard — the per-class XP leaderboard for one joined class.
//
// Live-subscribes to the class doc (so membership changes reflect), then fetches
// each member's PUBLIC profile row (leaderboard/{uid}) for their lifetime XP +
// name and ranks them with the SAME pure ranking used by the global board
// (buildCloudLeaderboard) — merging the viewer's own LIVE local XP over any
// stale cloud row so their standing is always current. Returns the exact
// UseLeaderboardResult shape the global board uses, so the page can render both
// boards with one component.
//
// Degrades gracefully: when `db` is null (tests) or the user is signed out it
// reports 'ready' with the local-only viewer row; a listener/fetch error reports
// 'error'. All members are shown (the board is a finite group), so the viewer is
// never pinned outside the window.

export function useClassLeaderboard(code: string | null): UseLeaderboardResult {
  const { user } = useAuth();
  const { progress } = useLessonProgress(lessons, user?.uid);

  const currentUserName = resolveLeaderboardDisplayName(user);
  const currentUserId = user?.uid ?? null;

  // `undefined` until the first class snapshot arrives (loading); `null` when the
  // class is missing/deleted; otherwise the live class record.
  const [record, setRecord] = useState<ClassRecord | null | undefined>(undefined);
  // The fetched member profile rows (excludes the viewer's own live row, which
  // buildCloudLeaderboard synthesizes). `null` until the first fetch resolves.
  const [memberEntries, setMemberEntries] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState(false);

  // Subscribe to the class doc for live membership.
  useEffect(() => {
    if (!db || !currentUserId || !code) {
      return undefined;
    }

    setRecord(undefined);
    setMemberEntries([]);
    setError(false);

    return subscribeClass(
      db,
      code,
      (nextRecord) => setRecord(nextRecord),
      () => setError(true),
    );
  }, [code, currentUserId]);

  // Whenever the membership list changes, (re)fetch the member profile rows.
  const memberKey = record ? record.memberUids.join(',') : '';

  useEffect(() => {
    if (!db || !record || record.memberUids.length === 0) {
      setMemberEntries([]);
      return undefined;
    }

    const database = db;
    let isCurrent = true;

    getLeaderboardEntriesByIds(database, record.memberUids)
      .then((entries) => {
        if (isCurrent) {
          setMemberEntries(entries);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setError(true);
        }
      });

    return () => {
      isCurrent = false;
    };
    // `memberKey` captures the membership set; re-fetch only when it changes.
  }, [memberKey]);

  const useCloud = Boolean(db) && Boolean(currentUserId);

  // Show every member (the class is a finite group), so pass a topN large enough
  // that the viewer is never pinned outside the visible window.
  const board = buildCloudLeaderboard({
    realEntries: useCloud ? memberEntries : [],
    currentUserId,
    currentUserXp: progress.totalXp,
    currentUserName,
    topN: MAX_CLASS_MEMBERS,
  });

  let status: UseLeaderboardResult['status'] = 'ready';
  if (useCloud && error) {
    status = 'error';
  } else if (useCloud && record === undefined) {
    status = 'loading';
  }

  return {
    status,
    entries: board.entries,
    currentUserRank: board.currentUserRank,
    currentUserOutsideTop: board.currentUserOutsideTop,
    topN: MAX_CLASS_MEMBERS,
  };
}
