import {
  GoogleAuthProvider,
  getAdditionalUserInfo,
  reauthenticateWithCredential,
  signInWithCredential,
  type Auth,
  type User,
} from 'firebase/auth';

/*
 * Native (Android/iOS WebView) Google sign-in.
 *
 * `signInWithPopup` cannot work inside a Capacitor WebView (there is no parent
 * browser window to host the OAuth popup), so on native we use the
 * `@capacitor-firebase/authentication` plugin to run the OS-level Google sign-in
 * and then BRIDGE the returned Google ID token into the Firebase JS SDK via
 * `signInWithCredential`. That keeps the JS SDK as the single source of truth, so
 * Firestore + callable Functions behave EXACTLY as they do on the web.
 *
 * The plugin is configured with `skipNativeAuth: true` (capacitor.config.ts), so
 * it only performs the OAuth handshake and hands us the credential — it does not
 * maintain a separate native Firebase session.
 *
 * The plugin is imported lazily so it is never pulled into the web bundle or the
 * test runner; these functions are only ever called when `isNativePlatform()`.
 */

async function loadFirebaseAuthentication() {
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
  return FirebaseAuthentication;
}

function googleCredentialFromTokens(idToken: string | undefined, accessToken: string | undefined) {
  if (!idToken) {
    throw new Error('Native Google sign-in did not return an ID token.');
  }

  return GoogleAuthProvider.credential(idToken, accessToken ?? null);
}

/** Runs native Google sign-in and signs the Firebase JS SDK in with the result. */
export async function signInWithGoogleNative(authInstance: Auth): Promise<{ isNewUser: boolean }> {
  const FirebaseAuthentication = await loadFirebaseAuthentication();
  const result = await FirebaseAuthentication.signInWithGoogle();
  const credential = googleCredentialFromTokens(
    result.credential?.idToken,
    result.credential?.accessToken,
  );

  const userCredential = await signInWithCredential(authInstance, credential);
  return { isNewUser: getAdditionalUserInfo(userCredential)?.isNewUser ?? false };
}

/**
 * Re-verifies a Google account natively before a sensitive action (account
 * deletion). Mirrors the web `reauthenticateWithPopup` path.
 */
export async function reauthenticateWithGoogleNative(user: User): Promise<void> {
  const FirebaseAuthentication = await loadFirebaseAuthentication();
  const result = await FirebaseAuthentication.signInWithGoogle();
  const credential = googleCredentialFromTokens(
    result.credential?.idToken,
    result.credential?.accessToken,
  );

  await reauthenticateWithCredential(user, credential);
}

/**
 * Best-effort clearing of the cached native Google session on sign-out, so the
 * next sign-in shows the account chooser instead of silently reusing the last
 * account. Never throws — the JS SDK sign-out is what actually ends the session.
 */
export async function signOutNative(): Promise<void> {
  try {
    const FirebaseAuthentication = await loadFirebaseAuthentication();
    await FirebaseAuthentication.signOut();
  } catch {
    // No native session / plugin unavailable — nothing to clear.
  }
}
