export function getAuthErrorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
}

export function getAuthErrorMessage(error: unknown) {
  const code = getAuthErrorCode(error);

  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account already exists for that email.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/missing-password':
      return 'Enter your password.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'Choose a stronger password: at least 10 characters with upper- and lower-case letters and a number.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/requires-recent-login':
      return 'For your security, please sign in again, then retry deleting your account.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with that email using a different sign-in method.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in was closed before it finished.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup.';
    case 'auth/operation-not-allowed':
      return 'That sign-in method is not enabled for this Firebase project.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for Firebase sign-in.';
    default:
      return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  }
}
