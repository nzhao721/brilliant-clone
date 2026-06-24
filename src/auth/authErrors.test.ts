import { describe, expect, it } from 'vitest';
import { getAuthErrorMessage } from './authErrors';

describe('getAuthErrorMessage', () => {
  it('returns a friendly duplicate email message', () => {
    expect(getAuthErrorMessage({ code: 'auth/email-already-in-use' })).toBe(
      'An account already exists for that email.',
    );
  });

  it('returns provider-agnostic popup messages', () => {
    expect(getAuthErrorMessage({ code: 'auth/popup-closed-by-user' })).toBe(
      'Sign-in was closed before it finished.',
    );
    expect(getAuthErrorMessage({ code: 'auth/popup-blocked' })).toBe(
      'Your browser blocked the sign-in popup.',
    );
  });

  it('returns friendly Firebase provider setup messages', () => {
    expect(getAuthErrorMessage({ code: 'auth/operation-not-allowed' })).toBe(
      'That sign-in method is not enabled for this Firebase project.',
    );
    expect(getAuthErrorMessage({ code: 'auth/unauthorized-domain' })).toBe(
      'This domain is not authorized for Firebase sign-in.',
    );
  });

  it('returns a single message for invalid email/password credentials', () => {
    expect(getAuthErrorMessage({ code: 'auth/invalid-credential' })).toBe(
      'Incorrect email or password.',
    );
    expect(getAuthErrorMessage({ code: 'auth/wrong-password' })).toBe(
      'Incorrect email or password.',
    );
    expect(getAuthErrorMessage({ code: 'auth/user-not-found' })).toBe(
      'Incorrect email or password.',
    );
  });

  it('explains when an email is linked to a different provider', () => {
    expect(getAuthErrorMessage({ code: 'auth/account-exists-with-different-credential' })).toBe(
      'An account already exists with that email using a different sign-in method.',
    );
  });

  it('falls back to the original error message', () => {
    expect(getAuthErrorMessage(new Error('Network unavailable'))).toBe('Network unavailable');
  });
});
