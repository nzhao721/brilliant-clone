import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getAuthErrorCode, getAuthErrorMessage } from '../auth/authErrors';
import { useAuth } from '../auth/AuthContext';

type LoginPageProps = {
  mode: 'login' | 'signup';
};

type AuthNavState = {
  from?: {
    pathname?: string;
  };
  reason?: 'no-account' | 'new-google' | 'account-exists';
  prefillEmail?: string;
};

export function LoginPage({ mode }: LoginPageProps) {
  const isSignup = mode === 'signup';
  const { isConfigured, loginWithEmail, loginWithGoogle, signUpWithEmail, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const navState = (location.state as AuthNavState | null) ?? null;
  const redirectTo = navState?.from?.pathname ?? '/dashboard';
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState(navState?.prefillEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // A first-time Google sign-in (Firebase auto-creates the account) is routed
  // here so the initial visit reads as creating an account, not a silent login.
  const isNewGoogleWelcome = isSignup && Boolean(user) && navState?.reason === 'new-google';

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (isSignup) {
        await signUpWithEmail(email, password, firstName);
      } else {
        await loginWithEmail(email, password);
      }
      navigate(redirectTo, { replace: true });
    } catch (authError) {
      const code = getAuthErrorCode(authError);

      // No account exists for this email — send them to create one.
      if (!isSignup && code === 'auth/user-not-found') {
        navigate('/signup', { state: { reason: 'no-account', prefillEmail: email } });
        return;
      }

      // An account already exists for this email — send them to log in instead.
      if (isSignup && code === 'auth/email-already-in-use') {
        navigate('/login', { state: { reason: 'account-exists', prefillEmail: email } });
        return;
      }

      setError(getAuthErrorMessage(authError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setIsSubmitting(true);

    try {
      const result = await loginWithGoogle();
      // A brand-new Google account has no SlopeWise account yet, so route it
      // through account creation instead of straight into the dashboard.
      if (!isSignup && result?.isNewUser) {
        navigate('/signup', { replace: true, state: { reason: 'new-google' } });
        return;
      }

      navigate(redirectTo, { replace: true });
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (user && !isNewGoogleWelcome) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isNewGoogleWelcome) {
    return (
      <section className="page-card narrow-card">
        <p className="eyebrow">Welcome to SlopeWise</p>
        <h1>Your account is ready</h1>
        <p>
          We created your SlopeWise account from your Google sign-in. Jump in and start
          building derivative intuition.
        </p>
        <button
          className="primary-button auth-submit"
          type="button"
          onClick={() => navigate('/dashboard', { replace: true })}
        >
          Go to your dashboard
        </button>
      </section>
    );
  }

  const disabled = !isConfigured || isSubmitting;

  return (
    <section className="page-card narrow-card">
      <h1>{isSignup ? 'Create your account' : 'Log in'}</h1>
      <p>
        {isSignup
          ? 'Create a free account so your progress is saved as you learn.'
          : 'Log back in to resume your calculus journey.'}
      </p>

      {!isConfigured ? (
        <div className="notice" role="status">
          Copy <code>.env.example</code> to <code>.env</code> and add your Firebase web app
          values to enable authentication locally.
        </div>
      ) : null}

      {isSignup && navState?.reason === 'no-account' ? (
        <div className="notice" role="status">
          We couldn&apos;t find a SlopeWise account
          {navState.prefillEmail ? (
            <>
              {' '}
              for <strong>{navState.prefillEmail}</strong>
            </>
          ) : null}
          . Create one below to get started.
        </div>
      ) : null}

      {!isSignup && navState?.reason === 'account-exists' ? (
        <div className="notice" role="status">
          You already have a SlopeWise account
          {navState.prefillEmail ? (
            <>
              {' '}
              for <strong>{navState.prefillEmail}</strong>
            </>
          ) : null}
          . Log in below to continue.
        </div>
      ) : null}

      {error ? (
        <div className="error-message" role="alert">
          {error}
        </div>
      ) : null}

      <form className="auth-form" onSubmit={handleEmailSubmit}>
        {isSignup ? (
          <div className="field">
            <label htmlFor="firstName">First name</label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              required
              value={firstName}
              disabled={disabled}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            disabled={disabled}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={6}
            value={password}
            disabled={disabled}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <button className="primary-button auth-submit" type="submit" disabled={disabled}>
          {isSignup ? 'Create account' : 'Log in'}
        </button>
      </form>

      <div className="auth-divider" role="separator">
        <span>or continue with</span>
      </div>

      <div className="provider-buttons">
        <button
          className="provider-button"
          type="button"
          disabled={disabled}
          onClick={() => void handleGoogle()}
        >
          <svg className="provider-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.15v2.84C3.96 20.53 7.67 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.15C1.42 8.53 1 10.21 1 12s.42 3.47 1.15 4.94l3.69-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.67 1 3.96 3.47 2.15 7.06l3.69 2.84C6.71 7.3 9.14 5.38 12 5.38z"
            />
          </svg>
          Continue with Google
        </button>
      </div>

      <p className="auth-switch">
        {isSignup ? (
          <>
            Already have an account? <Link to="/login">Log in</Link>
          </>
        ) : (
          <>
            New to SlopeWise?{' '}
            <Link to="/signup" state={{ prefillEmail: email }}>
              Create an account
            </Link>
          </>
        )}
      </p>
    </section>
  );
}
