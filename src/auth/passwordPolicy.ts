/*
 * Client-side password policy (defense-in-depth + UX). The AUTHORITATIVE policy is
 * enforced server-side by Firebase Auth (Identity Platform) "password policy"; this
 * mirrors it so weak passwords are rejected before a network round-trip and the
 * requirements are shown up front. Keep these rules in sync with the console policy
 * (Authentication > Settings > Password policy).
 *
 * Only NEW passwords (sign-up) are validated against this; the login form must keep
 * accepting older/shorter passwords so existing users aren't locked out.
 */
export const MIN_PASSWORD_LENGTH = 10;

export const PASSWORD_REQUIREMENTS_HINT =
  'At least 10 characters, including an uppercase letter, a lowercase letter, and a number.';

/** Returns a human error message if the password fails the policy, or null if it passes. */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(password)) {
    return 'Add at least one lowercase letter to your password.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Add at least one uppercase letter to your password.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Add at least one number to your password.';
  }
  return null;
}
