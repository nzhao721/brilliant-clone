import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { lessons } from '../data/lessons';
import { db } from '../lib/firebase';
import { resolveLeaderboardDisplayName } from '../leaderboard/leaderboardData';
import { upsertLeaderboardEntry } from '../leaderboard/leaderboardFirestore';
import { useLessonProgress } from '../lessons/lessonProgress';
import {
  createClass as createClassDoc,
  joinClass as joinClassDoc,
  leaveClass as leaveClassDoc,
  subscribeJoinedClasses,
  type ClassRecord,
  type CreateClassResult,
  type JoinClassResult,
  type LeaveClassResult,
} from './classData';

// useClasses — the class membership management hook for the leaderboard area.
//
// Surfaces the signed-in user's joined classes (live), plus create/join/leave
// actions and a simple display-name editor. Degrades gracefully: when Firebase
// is unconfigured (`db` null, e.g. tests) or the user is signed out, it reports
// `status: 'unavailable'` and every action returns a typed "unavailable"
// result instead of throwing.
//
// On a successful create/join (and on a name edit) it best-effort upserts the
// user's PUBLIC profile row at `leaderboard/{uid}` so they immediately appear on
// the class (and global) leaderboards with their current lifetime XP + name —
// reusing the same profile doc the global board already maintains, so XP is
// never duplicated.

const NOT_AVAILABLE_MESSAGE = 'Class leaderboards are unavailable right now.';
const NOT_SIGNED_IN_MESSAGE = 'Sign in to create or join a class.';

type ClassesStatus = 'loading' | 'ready' | 'unavailable';

type UpdateDisplayNameResult = { ok: true } | { ok: false; message: string };

export type UseClassesResult = {
  /** True when Firestore is configured (cloud class features are usable). */
  available: boolean;
  /** True when a user is signed in. */
  signedIn: boolean;
  status: ClassesStatus;
  /** The user's joined classes (live, name-sorted). */
  classes: ClassRecord[];
  /** True if the live classes listener errored (the list may be stale/empty). */
  error: boolean;
  /** How the user currently appears on the leaderboards. */
  displayName: string;
  /** Creates a class (optionally with a custom code) and auto-joins it. */
  createClass: (name: string, customCode?: string) => Promise<CreateClassResult>;
  /** Joins an existing class by code (idempotent). */
  joinClass: (code: string) => Promise<JoinClassResult>;
  /** Leaves a class the user is in. */
  leaveClass: (code: string) => Promise<LeaveClassResult>;
  /** Updates the user's display name (auth profile + public leaderboard row). */
  updateDisplayName: (name: string) => Promise<UpdateDisplayNameResult>;
};

export function useClasses(): UseClassesResult {
  const { user, updateDisplayName: updateAuthDisplayName } = useAuth();
  const { progress } = useLessonProgress(lessons, user?.uid);

  const uid = user?.uid ?? null;
  const available = Boolean(db);
  const signedIn = Boolean(uid);
  const displayName = resolveLeaderboardDisplayName(user);

  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [error, setError] = useState(false);
  // `null` until the first snapshot arrives, distinguishing "loading" from a
  // genuinely empty (no joined classes) list.
  const [loaded, setLoaded] = useState(false);

  // Keep the latest XP + name in refs so the create/join callbacks always upsert
  // the freshest profile values without being re-created on every XP change.
  const totalXpRef = useRef(progress.totalXp);
  const displayNameRef = useRef(displayName);
  totalXpRef.current = progress.totalXp;
  displayNameRef.current = displayName;

  useEffect(() => {
    if (!db || !uid) {
      setClasses([]);
      setLoaded(false);
      setError(false);
      return undefined;
    }

    setLoaded(false);
    setError(false);

    return subscribeJoinedClasses(
      db,
      uid,
      (nextClasses) => {
        setClasses(nextClasses);
        setLoaded(true);
      },
      () => {
        setError(true);
        setLoaded(true);
      },
    );
  }, [uid]);

  // Best-effort: sync the user's public profile row so they show on the boards
  // with their current XP + name. Never throws (a leaderboard write failure must
  // not block the class action).
  const syncProfile = useCallback(async () => {
    if (!db || !uid) {
      return;
    }

    try {
      await upsertLeaderboardEntry(db, {
        uid,
        displayName: displayNameRef.current,
        totalXp: totalXpRef.current,
      });
    } catch {
      // Ignore: the next progress save self-heals the row.
    }
  }, [uid]);

  const createClass = useCallback(
    async (name: string, customCode?: string): Promise<CreateClassResult> => {
      if (!db) {
        return { ok: false, reason: 'error', message: NOT_AVAILABLE_MESSAGE };
      }
      if (!uid) {
        return { ok: false, reason: 'error', message: NOT_SIGNED_IN_MESSAGE };
      }

      const result = await createClassDoc(db, { ownerUid: uid, customCode, name });

      if (result.ok) {
        await syncProfile();
      }

      return result;
    },
    [uid, syncProfile],
  );

  const joinClass = useCallback(
    async (code: string): Promise<JoinClassResult> => {
      if (!db) {
        return { ok: false, reason: 'error', message: NOT_AVAILABLE_MESSAGE };
      }
      if (!uid) {
        return { ok: false, reason: 'error', message: NOT_SIGNED_IN_MESSAGE };
      }

      const result = await joinClassDoc(db, { uid, code });

      if (result.ok) {
        await syncProfile();
      }

      return result;
    },
    [uid, syncProfile],
  );

  const leaveClass = useCallback(
    async (code: string): Promise<LeaveClassResult> => {
      if (!db || !uid) {
        return { ok: false, reason: 'error', message: NOT_AVAILABLE_MESSAGE };
      }

      return leaveClassDoc(db, { uid, code });
    },
    [uid],
  );

  const updateDisplayName = useCallback(
    async (name: string): Promise<UpdateDisplayNameResult> => {
      const trimmed = name.trim();

      if (!trimmed) {
        return { ok: false, message: 'Enter a display name.' };
      }
      if (!uid) {
        return { ok: false, message: NOT_SIGNED_IN_MESSAGE };
      }

      try {
        await updateAuthDisplayName(trimmed);
        displayNameRef.current = resolveLeaderboardDisplayName({ displayName: trimmed });
        // Push the new name onto the public profile so the boards update now.
        await syncProfile();
        return { ok: true };
      } catch {
        return { ok: false, message: 'Could not update your display name. Please try again.' };
      }
    },
    [uid, updateAuthDisplayName, syncProfile],
  );

  const status: ClassesStatus = useMemo(() => {
    if (!available || !signedIn) {
      return 'unavailable';
    }

    return loaded ? 'ready' : 'loading';
  }, [available, signedIn, loaded]);

  return {
    available,
    signedIn,
    status,
    classes,
    error,
    displayName,
    createClass,
    joinClass,
    leaveClass,
    updateDisplayName,
  };
}
