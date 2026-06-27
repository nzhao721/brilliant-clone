import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  getAdditionalUserInfo,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, db, hasFirebaseConfig } from '../lib/firebase';
import { deleteUserLessonProgress } from '../lessons/firestoreProgress';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isConfigured: boolean;
  loginWithGoogle: () => Promise<{ isNewUser: boolean }>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, firstName: string) => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password?: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function assertAuthConfigured() {
  if (!auth) {
    throw new Error('Firebase is not configured. Copy .env.example to .env and add your project values.');
  }

  return auth;
}

/**
 * Deleting an account is a sensitive operation, so Firebase requires a recent
 * login. We re-verify the user up front (before deleting anything) so a failed
 * or cancelled re-auth leaves the account fully intact. Password accounts need
 * the current password; federated accounts re-verify through a provider popup.
 */
async function reauthenticateForDeletion(user: User, password?: string) {
  const providerIds = user.providerData.map((entry) => entry.providerId);

  if (password && user.email && providerIds.includes('password')) {
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
    return;
  }

  const federatedProviderId = providerIds.find((id) => id !== 'password');
  if (federatedProviderId) {
    const provider =
      federatedProviderId === 'google.com'
        ? new GoogleAuthProvider()
        : new OAuthProvider(federatedProviderId);
    await reauthenticateWithPopup(user, provider);
    return;
  }

  if (providerIds.includes('password')) {
    // Password account, but no password was supplied to verify with.
    throw { code: 'auth/missing-password' };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(hasFirebaseConfig);
  // Bumped after in-place profile mutations (e.g. setting displayName at
  // sign-up). updateProfile() changes the existing User object but does NOT
  // fire onAuthStateChanged, so without this the context value never changes
  // and consumers keep showing the pre-update user (greeting/menu fall back to
  // the email). Including it in the value deps forces a re-read of the user.
  const [profileVersion, setProfileVersion] = useState(0);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return undefined;
    }

    return onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser);
        setLoading(false);
      },
      () => {
        setUser(null);
        setLoading(false);
      },
    );
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isConfigured: hasFirebaseConfig,
      loginWithGoogle: async () => {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(assertAuthConfigured(), provider);
        return { isNewUser: getAdditionalUserInfo(result)?.isNewUser ?? false };
      },
      loginWithEmail: async (email, password) => {
        await signInWithEmailAndPassword(assertAuthConfigured(), email, password);
      },
      signUpWithEmail: async (email, password, firstName) => {
        const credential = await createUserWithEmailAndPassword(
          assertAuthConfigured(),
          email,
          password,
        );

        const trimmedName = firstName.trim();
        if (trimmedName) {
          // Best-effort: the account already exists at this point, so a failed
          // profile update shouldn't fail sign-up: the greeting and menu just
          // fall back to the email until the name is set.
          try {
            await updateProfile(credential.user, { displayName: trimmedName });
            // updateProfile mutates the current User in place without emitting
            // an auth state change, so bump the version to force consumers to
            // re-render and pick up the new displayName immediately instead of
            // falling back to the email.
            setProfileVersion((version) => version + 1);
          } catch {
            // Ignore: displayName stays unset.
          }
        }
      },
      updateDisplayName: async (displayName) => {
        const currentUser = assertAuthConfigured().currentUser;

        if (!currentUser) {
          throw new Error('You need to be signed in to change your display name.');
        }

        await updateProfile(currentUser, { displayName: displayName.trim() });
        // updateProfile mutates the current User in place without emitting an
        // auth-state change (same as sign-up), so bump the version to force
        // consumers to re-render and pick up the new name immediately.
        setProfileVersion((version) => version + 1);
      },
      logout: async () => {
        await signOut(assertAuthConfigured());
      },
      deleteAccount: async (password) => {
        const currentUser = assertAuthConfigured().currentUser;

        if (!currentUser) {
          throw new Error('You need to be signed in to delete your account.');
        }

        // Re-verify first so nothing is deleted unless we can finish the job.
        await reauthenticateForDeletion(currentUser, password);

        // Remove the user's stored data while still authenticated (Firestore
        // rules reject the write once the auth account is gone), then delete
        // the account itself.
        if (db) {
          await deleteUserLessonProgress(db, currentUser.uid);
        }

        await deleteUser(currentUser);
      },
    }),
    [loading, user, profileVersion],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
