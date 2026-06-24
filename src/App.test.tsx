import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { renderWithRouter } from './test/renderWithRouter';

vi.mock('./lib/firebase', () => ({
  auth: null,
  db: null,
  hasFirebaseConfig: false,
}));

describe('App routes', () => {
  it('renders the home page by default', () => {
    renderWithRouter(<App />);

    expect(
      screen.getByRole('heading', {
        name: 'Learn what a derivative means before memorizing rules.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('renders the dashboard route', () => {
    renderWithRouter(<App />, '/dashboard');

    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByText(/add your Firebase web app values/i)).toBeInTheDocument();
  });

  it('protects the lesson placeholder route', () => {
    renderWithRouter(<App />, '/lessons/what-changes');

    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });

  it('protects the practice route', () => {
    renderWithRouter(<App />, '/practice');

    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });

  it('renders the signup route', () => {
    renderWithRouter(<App />, '/signup');

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
  });
});
