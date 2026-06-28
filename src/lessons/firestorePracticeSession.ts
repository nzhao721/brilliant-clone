/*
 * Firestore persistence for the in-progress practice session (the AUTHORITATIVE
 * copy; the localStorage mirror in ./practiceSession is only a same-device
 * optimization). One doc per user at users/{uid}/learning/practiceSession, a
 * sibling of the lesson-progress doc. Mirrors ./firestoreProgress's shape:
 * normalize on the way in/out, stamp a server `updatedAt`, never throw beyond the
 * SDK's own rejections (callers handle failures).
 */

import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import {
  normalizePracticeSessionSnapshot,
  type PracticeSessionSnapshot,
} from './practiceSession';

const learningCollectionPath = 'learning';
const practiceSessionDocumentId = 'practiceSession';

function getPracticeSessionDocRef(firestore: Firestore, userId: string) {
  return doc(firestore, 'users', userId, learningCollectionPath, practiceSessionDocumentId);
}

/** Loads + normalizes the saved session, or `null` when absent/unusable. */
export async function loadUserPracticeSession(
  firestore: Firestore,
  userId: string,
): Promise<PracticeSessionSnapshot | null> {
  const snapshot = await getDoc(getPracticeSessionDocRef(firestore, userId));
  if (!snapshot.exists()) {
    return null;
  }
  return normalizePracticeSessionSnapshot(snapshot.data());
}

/** Writes the session doc (normalized) with a server `updatedAt`. */
export async function saveUserPracticeSession(
  firestore: Firestore,
  userId: string,
  snapshot: PracticeSessionSnapshot,
): Promise<void> {
  const normalized = normalizePracticeSessionSnapshot(snapshot);
  if (!normalized) {
    return;
  }
  await setDoc(getPracticeSessionDocRef(firestore, userId), {
    ...normalized,
    updatedAt: serverTimestamp(),
  });
}

/** Deletes the session doc (on completion/restart/account deletion). */
export async function deleteUserPracticeSession(
  firestore: Firestore,
  userId: string,
): Promise<void> {
  await deleteDoc(getPracticeSessionDocRef(firestore, userId));
}
