import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuth } from './AuthContext';

vi.mock('./AuthContext', () => ({
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
    deleteAccount: vi.fn(),
    ...overrides,
  };
}

function renderProtectedRoute() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Protected dashboard</div>} />
        </Route>
        <Route path="/login" element={<div>Login destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('shows a loading state while auth is initializing', () => {
    mockedUseAuth.mockReturnValue(authState({ loading: true }));

    renderProtectedRoute();

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.getByText('Loading', { selector: '.eyebrow' })).toBeInTheDocument();
  });

  it('redirects signed-out users to login', () => {
    mockedUseAuth.mockReturnValue(authState({ user: null }));

    renderProtectedRoute();

    expect(screen.getByText('Login destination')).toBeInTheDocument();
  });

  it('renders protected content for signed-in users', () => {
    mockedUseAuth.mockReturnValue(
      authState({ user: { email: 'maya@example.com' } as ReturnType<typeof useAuth>['user'] }),
    );

    renderProtectedRoute();

    expect(screen.getByText('Protected dashboard')).toBeInTheDocument();
  });
});
