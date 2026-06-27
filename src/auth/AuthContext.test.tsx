import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  type User,
} from 'firebase/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { deleteUserLessonProgress } from '../lessons/firestoreProgress';

const mocks = vi.hoisted(() => ({
  auth: { name: 'mock-auth' } as { name: string; currentUser?: unknown },
  db: { name: 'mock-db' },
  googleProvider: { providerId: 'google.com' },
}));

vi.mock('../lib/firebase', () => ({
  auth: mocks.auth,
  db: mocks.db,
  hasFirebaseConfig: true,
}));

vi.mock('../lessons/firestoreProgress', () => ({
  deleteUserLessonProgress: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  EmailAuthProvider: {
    credential: vi.fn((email: string, password: string) => ({
      providerId: 'password',
      email,
      password,
    })),
  },
  GoogleAuthProvider: vi.fn(function GoogleAuthProvider() {
    return mocks.googleProvider;
  }),
  OAuthProvider: vi.fn(function OAuthProvider(providerId: string) {
    return { providerId };
  }),
  createUserWithEmailAndPassword: vi.fn(),
  deleteUser: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  onAuthStateChanged: vi.fn((_auth, callback) => {
    callback(null);
    return vi.fn();
  }),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
  getAdditionalUserInfo: vi.fn(() => ({ isNewUser: false })),
}));

function AuthHarness() {
  const { loginWithGoogle, loginWithEmail, signUpWithEmail } = useAuth();

  return (
    <>
      <button type="button" onClick={() => void loginWithGoogle()}>
        Sign in with Google
      </button>
      <button type="button" onClick={() => void loginWithEmail('maya@example.com', 'sup3rsecret')}>
        Sign in with email
      </button>
      <button
        type="button"
        onClick={() => void signUpWithEmail('maya@example.com', 'sup3rsecret', 'Maya')}
      >
        Sign up with email
      </button>
    </>
  );
}

function LoadingHarness() {
  const { loading } = useAuth();

  return <div>{loading ? 'Loading auth' : 'Auth ready'}</div>;
}

function SignUpNameHarness() {
  const { user, signUpWithEmail } = useAuth();

  return (
    <>
      <button
        type="button"
        onClick={() => void signUpWithEmail('maya@example.com', 'sup3rsecret', 'Maya')}
      >
        Sign up with email
      </button>
      <p>Greeting name: {user?.displayName ?? '(email fallback)'}</p>
    </>
  );
}

function DeleteHarness({ password }: { password?: string }) {
  const { deleteAccount } = useAuth();

  return (
    <button type="button" onClick={() => void deleteAccount(password)}>
      Delete account
    </button>
  );
}

function UpdateNameHarness() {
  const { updateDisplayName } = useAuth();

  return (
    <button type="button" onClick={() => void updateDisplayName('Ada Lovelace')}>
      Update name
    </button>
  );
}

describe('AuthProvider sign-in methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(signInWithPopup).mockResolvedValue({} as Awaited<ReturnType<typeof signInWithPopup>>);
  });

  it('creates a Google provider and signs in with a popup', async () => {
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    expect(onAuthStateChanged).toHaveBeenCalledWith(
      mocks.auth,
      expect.any(Function),
      expect.any(Function),
    );
    expect(GoogleAuthProvider).toHaveBeenCalledTimes(1);
    expect(signInWithPopup).toHaveBeenCalledWith(mocks.auth, mocks.googleProvider);
  });

  it('signs in with email and password', async () => {
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Sign in with email' }));

    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      mocks.auth,
      'maya@example.com',
      'sup3rsecret',
    );
  });

  it('creates an account, then saves the first name as the display name', async () => {
    const user = userEvent.setup();
    const newUser = { uid: 'new-user' };
    vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({ user: newUser } as never);
    vi.mocked(updateProfile).mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Sign up with email' }));

    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
      mocks.auth,
      'maya@example.com',
      'sup3rsecret',
    );
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(newUser, { displayName: 'Maya' }),
    );
  });

  it('publishes the new display name to consumers immediately after sign-up', async () => {
    const user = userEvent.setup();
    /* Mirrors the SDK: updateProfile mutates the User in place with no auth-state
     * change. Without the fix, consumers keep the pre-update user. */
    const newUser: { uid: string; displayName: string | null } = {
      uid: 'new-user',
      displayName: null,
    };

    let emitAuthUser: ((nextUser: unknown) => void) | undefined;
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, nextOrObserver) => {
      emitAuthUser = nextOrObserver as (nextUser: unknown) => void;
      emitAuthUser(null);
      return vi.fn();
    });
    vi.mocked(createUserWithEmailAndPassword).mockImplementation(async () => {
      // Firebase emits the freshly created (still name-less) user.
      emitAuthUser?.(newUser);
      return { user: newUser } as never;
    });
    vi.mocked(updateProfile).mockImplementation(async (mutableUser, profile) => {
      (mutableUser as typeof newUser).displayName = profile.displayName ?? null;
    });

    render(
      <AuthProvider>
        <SignUpNameHarness />
      </AuthProvider>,
    );

    expect(screen.getByText('Greeting name: (email fallback)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign up with email' }));

    expect(await screen.findByText('Greeting name: Maya')).toBeInTheDocument();
  });

  it('shows the loading state until the auth state resolves', () => {
    let resolveAuthState: ((nextUser: User | null) => void) | undefined;

    vi.mocked(onAuthStateChanged).mockImplementationOnce((_auth, nextOrObserver) => {
      resolveAuthState = nextOrObserver as (nextUser: User | null) => void;
      return vi.fn();
    });

    render(
      <AuthProvider>
        <LoadingHarness />
      </AuthProvider>,
    );

    expect(screen.getByText('Loading auth')).toBeInTheDocument();

    act(() => {
      resolveAuthState?.(null);
    });

    expect(screen.getByText('Auth ready')).toBeInTheDocument();
  });

  it('stops loading when auth initialization fails', () => {
    let failAuthState: ((authError: Error) => void) | undefined;

    vi.mocked(onAuthStateChanged).mockImplementationOnce((_auth, _nextOrObserver, onError) => {
      failAuthState = onError;
      return vi.fn();
    });

    render(
      <AuthProvider>
        <LoadingHarness />
      </AuthProvider>,
    );

    expect(screen.getByText('Loading auth')).toBeInTheDocument();

    act(() => {
      failAuthState?.(new Error('Auth unavailable'));
    });

    expect(screen.getByText('Auth ready')).toBeInTheDocument();
  });
});

describe('AuthProvider account deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-verifies via provider popup, deletes stored data, then deletes the account', async () => {
    const user = userEvent.setup();
    const currentUser = {
      uid: 'user-1',
      email: 'maya@example.com',
      providerData: [{ providerId: 'google.com' }],
    };
    mocks.auth.currentUser = currentUser;
    vi.mocked(reauthenticateWithPopup).mockResolvedValue({} as never);
    vi.mocked(deleteUser).mockResolvedValue(undefined);
    vi.mocked(deleteUserLessonProgress).mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <DeleteHarness />
      </AuthProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Delete account' }));

    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith(currentUser));
    expect(reauthenticateWithPopup).toHaveBeenCalledWith(currentUser, mocks.googleProvider);
    expect(deleteUserLessonProgress).toHaveBeenCalledWith(mocks.db, 'user-1');
  });

  it('re-verifies a password account with the supplied password before deleting', async () => {
    const user = userEvent.setup();
    const currentUser = {
      uid: 'user-2',
      email: 'maya@example.com',
      providerData: [{ providerId: 'password' }],
    };
    mocks.auth.currentUser = currentUser;
    vi.mocked(reauthenticateWithCredential).mockResolvedValue({} as never);
    vi.mocked(deleteUser).mockResolvedValue(undefined);
    vi.mocked(deleteUserLessonProgress).mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <DeleteHarness password="sup3rsecret" />
      </AuthProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Delete account' }));

    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith(currentUser));
    expect(EmailAuthProvider.credential).toHaveBeenCalledWith('maya@example.com', 'sup3rsecret');
    expect(reauthenticateWithCredential).toHaveBeenCalledTimes(1);
    expect(reauthenticateWithPopup).not.toHaveBeenCalled();
  });
});

describe('AuthProvider display name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the new display name to the current user via updateProfile', async () => {
    const user = userEvent.setup();
    const currentUser = { uid: 'u1', displayName: null };
    mocks.auth.currentUser = currentUser;
    vi.mocked(updateProfile).mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <UpdateNameHarness />
      </AuthProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Update name' }));

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(currentUser, { displayName: 'Ada Lovelace' }),
    );
  });
});
