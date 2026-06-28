import { useCallback, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import {
  deleteUserPracticeSession,
  loadUserPracticeSession,
  saveUserPracticeSession,
} from './firestorePracticeSession';
import {
  clearLocalPracticeSession,
  readLocalPracticeSession,
  writeLocalPracticeSession,
  type PracticeSessionSnapshot,
} from './practiceSession';

/*
 * Persistence plumbing for the in-progress practice session. Writes the
 * localStorage mirror SYNCHRONOUSLY (instant same-device resume) on every save,
 * and DEBOUNCES the authoritative Firestore write through a serial queue (like the
 * lesson-progress sync), flushing any pending write on unmount so leaving the page
 * still persists. All Firestore work no-ops gracefully when signed out or when
 * Firebase is unconfigured (tests), leaving the local mirror as the only store.
 */

const SAVE_DEBOUNCE_MS = 700;

export type PracticeSessionStore = {
  /** The same-device mirror read ONCE at mount (for synchronous restore). */
  initialLocal: PracticeSessionSnapshot | null;
  /** Loads the authoritative Firestore copy (null when absent/offline/signed-out). */
  loadRemote: () => Promise<PracticeSessionSnapshot | null>;
  /** Persists a snapshot: local mirror always; Firestore unless `remote: false`. */
  save: (snapshot: PracticeSessionSnapshot, options?: { remote?: boolean }) => void;
  /** Clears the session everywhere (on completion/restart). */
  clear: () => void;
};

export function usePracticeSessionStore(userId: string | null | undefined): PracticeSessionStore {
  const initialLocalRef = useRef<PracticeSessionSnapshot | null | undefined>(undefined);
  if (initialLocalRef.current === undefined) {
    initialLocalRef.current = userId ? readLocalPracticeSession(userId) : null;
  }

  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<PracticeSessionSnapshot | null>(null);

  const enqueue = useCallback((task: () => Promise<unknown>) => {
    queueRef.current = queueRef.current.catch(() => undefined).then(task);
    return queueRef.current;
  }, []);

  const flushRemote = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const snapshot = pendingRef.current;
    pendingRef.current = null;
    const currentUserId = userIdRef.current;
    if (!snapshot || !db || !currentUserId) {
      return;
    }
    const firestore = db;
    void enqueue(() => saveUserPracticeSession(firestore, currentUserId, snapshot)).catch(
      () => undefined,
    );
  }, [enqueue]);

  const save = useCallback(
    (snapshot: PracticeSessionSnapshot, options?: { remote?: boolean }) => {
      const currentUserId = userIdRef.current;
      if (!currentUserId) {
        return;
      }
      writeLocalPracticeSession(currentUserId, snapshot);
      if (options?.remote === false || !db) {
        return;
      }
      pendingRef.current = snapshot;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(flushRemote, SAVE_DEBOUNCE_MS);
    },
    [flushRemote],
  );

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    clearLocalPracticeSession();
    const currentUserId = userIdRef.current;
    if (db && currentUserId) {
      const firestore = db;
      void enqueue(() => deleteUserPracticeSession(firestore, currentUserId)).catch(() => undefined);
    }
  }, [enqueue]);

  const loadRemote = useCallback(async (): Promise<PracticeSessionSnapshot | null> => {
    const currentUserId = userIdRef.current;
    if (!db || !currentUserId) {
      return null;
    }
    return loadUserPracticeSession(db, currentUserId);
  }, []);

  // Flush any pending debounced write when the page unmounts (navigate away).
  useEffect(() => () => flushRemote(), [flushRemote]);

  return { initialLocal: initialLocalRef.current, loadRemote, save, clear };
}
