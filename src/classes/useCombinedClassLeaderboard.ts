import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { lessons } from '../data/lessons';
import { db } from '../lib/firebase';
import {
  buildCloudLeaderboard,
  resolveLeaderboardDisplayName,
  type LeaderboardEntry,
  type RankedLeaderboardEntry,
} from '../leaderboard/leaderboardData';
import { getLeaderboardEntriesByIds } from '../leaderboard/leaderboardFirestore';
import { useLessonProgress } from '../lessons/lessonProgress';
import { MAX_CLASS_MEMBERS } from './classData';
import { useClasses } from './useClasses';

// useCombinedClassLeaderboard — the viewer ranked against EVERY classmate they
// share a class with, across ALL their joined classes at once.
//
// It reuses `useClasses` for the live membership of each joined class, unions all
// `memberUids` into ONE de-duplicated set (a student in two shared classes counts
// once, by uid), fetches each member's PUBLIC profile row (leaderboard/{uid}) for
// their lifetime XP + name, and ranks them with the SAME pure ranking the global
// and per-class boards use (buildCloudLeaderboard) — merging the viewer's own
// LIVE local XP over any stale cloud row so the gap matches what classmates see.
//
// Degrades gracefully so the caller can simply hide on anything but 'ready':
//   • Firebase unconfigured / signed out → 'unavailable'
//   • classes still loading, or the member fetch in flight → 'loading'
//   • a class-list or member-fetch failure → 'error'

export type CombinedClassLeaderboardStatus = 'unavailable' | 'loading' | 'ready' | 'error';

export type CombinedClassLeaderboardResult = {
  status: CombinedClassLeaderboardStatus;
  /** Viewer + every classmate across all their classes, de-duped by uid, XP-ranked. */
  entries: RankedLeaderboardEntry[];
};

export function useCombinedClassLeaderboard(): CombinedClassLeaderboardResult {
  const { user } = useAuth();
  const { progress } = useLessonProgress(lessons, user?.uid);
  const {
    classes,
    status: classesStatus,
    error: classesError,
    available,
    signedIn,
  } = useClasses();

  const currentUserId = user?.uid ?? null;
  const currentUserName = resolveLeaderboardDisplayName(user);

  // Union of every classmate uid across ALL the user's classes, de-duped by uid.
  // Serialized to a stable string so the fetch effect only re-runs when the set
  // (not its array identity) actually changes.
  const memberKey = useMemo(() => {
    const ids = new Set<string>();
    for (const joinedClass of classes) {
      for (const memberUid of joinedClass.memberUids) {
        ids.add(memberUid);
      }
    }
    return Array.from(ids).join(',');
  }, [classes]);

  // The fetched member profile rows. The viewer's own (possibly stale) row is
  // dropped by buildCloudLeaderboard in favor of their live local XP.
  const [memberEntries, setMemberEntries] = useState<LeaderboardEntry[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    const uids = memberKey ? memberKey.split(',') : [];

    if (!db || uids.length === 0) {
      setMemberEntries([]);
      setMembersLoading(false);
      setFetchError(false);
      return undefined;
    }

    const database = db;
    let isCurrent = true;
    setMembersLoading(true);
    setFetchError(false);

    getLeaderboardEntriesByIds(database, uids)
      .then((entries) => {
        if (isCurrent) {
          setMemberEntries(entries);
          setMembersLoading(false);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setFetchError(true);
          setMembersLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [memberKey]);

  const useCloud = Boolean(db) && Boolean(currentUserId);

  // Rank the viewer + the combined classmate set. A large topN keeps everyone in
  // the window so the viewer's true neighbors are always present.
  const board = buildCloudLeaderboard({
    realEntries: useCloud ? memberEntries : [],
    currentUserId,
    currentUserXp: progress.totalXp,
    currentUserName,
    topN: MAX_CLASS_MEMBERS,
  });

  let status: CombinedClassLeaderboardStatus;
  if (!available || !signedIn) {
    status = 'unavailable';
  } else if (classesError || fetchError) {
    status = 'error';
  } else if (classesStatus === 'loading' || membersLoading) {
    status = 'loading';
  } else {
    status = 'ready';
  }

  return { status, entries: board.entries };
}
