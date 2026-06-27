import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GoogleAuthProvider,
  getAdditionalUserInfo,
  reauthenticateWithCredential,
  signInWithCredential,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  reauthenticateWithGoogleNative,
  signInWithGoogleNative,
  signOutNative,
} from './nativeAuth';

/* The native plugin is dynamically imported inside nativeAuth; Vitest intercepts
   both static and dynamic imports, so this mock stands in for the real plugin. */
const signInWithGoogle = vi.fn();
const signOut = vi.fn();
vi.mock('@capacitor-firebase/authentication', () => ({
  FirebaseAuthentication: {
    signInWithGoogle: (...args: unknown[]) => signInWithGoogle(...args),
    signOut: (...args: unknown[]) => signOut(...args),
  },
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: {
    credential: vi.fn((idToken: string | null, accessToken: string | null) => ({
      providerId: 'google.com',
      idToken,
      accessToken,
    })),
  },
  getAdditionalUserInfo: vi.fn(() => ({ isNewUser: false })),
  reauthenticateWithCredential: vi.fn(),
  signInWithCredential: vi.fn(),
}));

const authInstance = { name: 'mock-auth' } as unknown as Auth;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('signInWithGoogleNative', () => {
  it('bridges the native Google credential into the Firebase JS SDK', async () => {
    signInWithGoogle.mockResolvedValue({
      credential: { idToken: 'id-token', accessToken: 'access-token' },
    });
    vi.mocked(signInWithCredential).mockResolvedValue({} as never);
    vi.mocked(getAdditionalUserInfo).mockReturnValue({ isNewUser: true } as never);

    const result = await signInWithGoogleNative(authInstance);

    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(GoogleAuthProvider.credential).toHaveBeenCalledWith('id-token', 'access-token');
    expect(signInWithCredential).toHaveBeenCalledWith(authInstance, {
      providerId: 'google.com',
      idToken: 'id-token',
      accessToken: 'access-token',
    });
    expect(result).toEqual({ isNewUser: true });
  });

  it('defaults isNewUser to false when the SDK reports nothing', async () => {
    signInWithGoogle.mockResolvedValue({ credential: { idToken: 'id-token' } });
    vi.mocked(signInWithCredential).mockResolvedValue({} as never);
    vi.mocked(getAdditionalUserInfo).mockReturnValue(null as never);

    const result = await signInWithGoogleNative(authInstance);

    expect(GoogleAuthProvider.credential).toHaveBeenCalledWith('id-token', null);
    expect(result).toEqual({ isNewUser: false });
  });

  it('throws (without touching the JS SDK) when no ID token comes back', async () => {
    signInWithGoogle.mockResolvedValue({ credential: {} });

    await expect(signInWithGoogleNative(authInstance)).rejects.toThrow(/ID token/i);
    expect(signInWithCredential).not.toHaveBeenCalled();
  });
});

describe('reauthenticateWithGoogleNative', () => {
  it('re-verifies the user with a freshly fetched native credential', async () => {
    const user = { uid: 'user-1' } as unknown as User;
    signInWithGoogle.mockResolvedValue({
      credential: { idToken: 'id-token', accessToken: 'access-token' },
    });
    vi.mocked(reauthenticateWithCredential).mockResolvedValue({} as never);

    await reauthenticateWithGoogleNative(user);

    expect(GoogleAuthProvider.credential).toHaveBeenCalledWith('id-token', 'access-token');
    expect(reauthenticateWithCredential).toHaveBeenCalledWith(user, {
      providerId: 'google.com',
      idToken: 'id-token',
      accessToken: 'access-token',
    });
  });
});

describe('signOutNative', () => {
  it('signs out of the native plugin session', async () => {
    signOut.mockResolvedValue(undefined);

    await signOutNative();

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('never throws when the native sign-out fails', async () => {
    signOut.mockRejectedValue(new Error('no native session'));

    await expect(signOutNative()).resolves.toBeUndefined();
  });
});
