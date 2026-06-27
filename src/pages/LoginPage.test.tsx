import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { LoginPage } from './LoginPage';

vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

function authState(overrides: Partial<ReturnType<typeof useAuth>> = {}): ReturnType<typeof useAuth> {
  return {
    user: null,
    loading: false,
    isConfigured: true,
    loginWithGoogle: vi.fn(),
    loginWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    logout: vi.fn(),
    updateDisplayName: vi.fn(),
    deleteAccount: vi.fn(),
    ...overrides,
  };
}

function renderAuthPage(mode: 'login' | 'signup') {
  return render(
    <MemoryRouter initialEntries={[mode === 'login' ? '/login' : '/signup']}>
      <Routes>
        <Route path="/login" element={<LoginPage mode="login" />} />
        <Route path="/signup" element={<LoginPage mode="signup" />} />
        <Route path="/dashboard" element={<div>Dashboard destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  it('renders email, password, and social sign-in options', () => {
    mockedUseAuth.mockReturnValue(authState());

    renderAuthPage('login');

    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  });

  it('renders the signup submit label', () => {
    mockedUseAuth.mockReturnValue(authState());

    renderAuthPage('signup');

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });

  it('disables submission until Firebase env config is present', () => {
    mockedUseAuth.mockReturnValue(authState({ isConfigured: false }));

    renderAuthPage('login');

    expect(screen.getByRole('status')).toHaveTextContent('add your Firebase web app values');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
  });

  it('signs in with email and password then navigates to the dashboard', async () => {
    const user = userEvent.setup();
    const loginWithEmail = vi.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue(authState({ loginWithEmail }));

    renderAuthPage('login');
    await user.type(screen.getByLabelText('Email'), 'maya@example.com');
    await user.type(screen.getByLabelText('Password'), 'sup3rsecret');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(loginWithEmail).toHaveBeenCalledWith('maya@example.com', 'sup3rsecret');
    await waitFor(() => expect(screen.getByText('Dashboard destination')).toBeInTheDocument());
  });

  it('creates an account with first name, email, and password in signup mode', async () => {
    const user = userEvent.setup();
    const signUpWithEmail = vi.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue(authState({ signUpWithEmail }));

    renderAuthPage('signup');
    await user.type(screen.getByLabelText('First name'), 'Newbie');
    await user.type(screen.getByLabelText('Email'), 'newbie@example.com');
    await user.type(screen.getByLabelText('Password'), 'sup3rsecret');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(signUpWithEmail).toHaveBeenCalledWith('newbie@example.com', 'sup3rsecret', 'Newbie');
    await waitFor(() => expect(screen.getByText('Dashboard destination')).toBeInTheDocument());
  });

  it('shows friendly auth errors when a popup is closed', async () => {
    const user = userEvent.setup();
    const loginWithGoogle = vi.fn().mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    mockedUseAuth.mockReturnValue(authState({ loginWithGoogle }));

    renderAuthPage('login');
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-in was closed before it finished.',
    );
  });

  it('sends a login with no matching account to the create account page', async () => {
    const user = userEvent.setup();
    const loginWithEmail = vi.fn().mockRejectedValue({ code: 'auth/user-not-found' });
    mockedUseAuth.mockReturnValue(authState({ loginWithEmail }));

    renderAuthPage('login');
    await user.type(screen.getByLabelText('Email'), 'newbie@example.com');
    await user.type(screen.getByLabelText('Password'), 'sup3rsecret');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(loginWithEmail).toHaveBeenCalledWith('newbie@example.com', 'sup3rsecret');
    expect(
      await screen.findByRole('heading', { name: 'Create your account' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('newbie@example.com');
    expect(screen.getByRole('status')).toHaveTextContent('find a SlopeWise account');
  });

  it('routes a brand-new Google sign-in to account creation', async () => {
    const user = userEvent.setup();
    const loginWithGoogle = vi.fn().mockResolvedValue({ isNewUser: true });
    mockedUseAuth.mockReturnValue(authState({ loginWithGoogle }));

    renderAuthPage('login');
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(loginWithGoogle).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('heading', { name: 'Create your account' }),
    ).toBeInTheDocument();
  });

  it('keeps an existing Google sign-in headed to the dashboard', async () => {
    const user = userEvent.setup();
    const loginWithGoogle = vi.fn().mockResolvedValue({ isNewUser: false });
    mockedUseAuth.mockReturnValue(authState({ loginWithGoogle }));

    renderAuthPage('login');
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(loginWithGoogle).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('Dashboard destination')).toBeInTheDocument());
  });

  it('welcomes a brand-new Google account on the create account page', () => {
    mockedUseAuth.mockReturnValue(
      authState({ user: { uid: 'new-user' } as ReturnType<typeof useAuth>['user'] }),
    );

    render(
      <MemoryRouter initialEntries={[{ pathname: '/signup', state: { reason: 'new-google' } }]}>
        <Routes>
          <Route path="/signup" element={<LoginPage mode="signup" />} />
          <Route path="/dashboard" element={<div>Dashboard destination</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Your account is ready' })).toBeInTheDocument();
  });

  it('sends a signup for an existing account to the log in page', async () => {
    const user = userEvent.setup();
    const signUpWithEmail = vi.fn().mockRejectedValue({ code: 'auth/email-already-in-use' });
    mockedUseAuth.mockReturnValue(authState({ signUpWithEmail }));

    renderAuthPage('signup');
    await user.type(screen.getByLabelText('First name'), 'Maya');
    await user.type(screen.getByLabelText('Email'), 'maya@example.com');
    await user.type(screen.getByLabelText('Password'), 'sup3rsecret');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(signUpWithEmail).toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('maya@example.com');
    expect(screen.getByRole('status')).toHaveTextContent('already have a SlopeWise account');
  });
});
