import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { lessons } from '../data/lessons';
import {
  getTodayKey,
  lessonProgressDayOffsetStorageKey,
  lessonProgressStorageKey,
} from '../lessons/lessonProgress';
import {
  DashboardPage,
  getDashboardGreeting,
  getStudentFirstName,
  getTimeOfDay,
} from './DashboardPage';

vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

describe('getStudentFirstName', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('uses the first word from a Firebase display name', () => {
    expect(getStudentFirstName({ displayName: 'Maya Johnson', email: 'maya@example.com' })).toBe(
      'Maya',
    );
  });

  it('falls back to the email username when display name is missing', () => {
    expect(getStudentFirstName({ displayName: null, email: 'maya.student@example.com' })).toBe(
      'maya.student',
    );
  });

  it('falls back to student when no name is available', () => {
    expect(getStudentFirstName(null)).toBe('student');
  });

  it('renders the student greeting and sequential default lesson availability', () => {
    mockedUseAuth.mockReturnValue({
      user: { displayName: 'Maya Johnson', email: 'maya@example.com' } as ReturnType<
        typeof useAuth
      >['user'],
      loading: false,
      isConfigured: true,
      loginWithGoogle: vi.fn(),
      loginWithEmail: vi.fn(),
      signUpWithEmail: vi.fn(),
      logout: vi.fn(),
      deleteAccount: vi.fn(),
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Maya');
    expect(screen.getByRole('link', { name: 'Next up: Start Lesson 1, What Changes?' })).toHaveAttribute(
      'href',
      '/lessons/what-changes',
    );
    expect(screen.getByText('Total XP')).toBeInTheDocument();
    expect(screen.getByText('Total XP').closest('.stat-card') as HTMLElement).toHaveTextContent('0');
    expect(screen.queryByText(/random practice/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /practice/i })).not.toBeInTheDocument();
    expect(screen.getAllByText('Start', { selector: '.status-pill' })).toHaveLength(1);
    expect(screen.getAllByText('Locked', { selector: '.status-pill' })).toHaveLength(17);
    expect(screen.getAllByRole('link', { name: 'Start lesson' })[0]).toHaveAttribute(
      'href',
      '/lessons/what-changes',
    );
    expect(screen.getByText('Complete Lesson 1 first.')).toBeInTheDocument();
  });

  it('shows the next lesson after the first lesson is complete', () => {
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({
        completedLessonIds: ['what-changes'],
        dailyCompletionDates: ['2026-06-23'],
        dailyStudyMinutes: {
          [getTodayKey(0)]: 12,
        },
        lessonResumeStates: {
          'slope-refresher': {
            questionStates: {
              'slope-question': {
                answerResult: 'correct',
                selectedOptionId: 'three',
                showHint: false,
              },
            },
            stepIndex: 3,
          },
        },
        totalXp: 125,
      }),
    );
    mockedUseAuth.mockReturnValue({
      user: { displayName: 'Maya Johnson', email: 'maya@example.com' } as ReturnType<
        typeof useAuth
      >['user'],
      loading: false,
      isConfigured: true,
      loginWithGoogle: vi.fn(),
      loginWithEmail: vi.fn(),
      signUpWithEmail: vi.fn(),
      logout: vi.fn(),
      deleteAccount: vi.fn(),
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', { name: 'Next up: Resume Lesson 2, Slope Refresher' }),
    ).toHaveAttribute('href', '/lessons/slope-refresher');
    expect(screen.getByText('8%')).toBeInTheDocument();
    expect(screen.getByText('125')).toBeInTheDocument();
    expect(screen.getByText('Complete', { selector: '.status-pill' })).toBeInTheDocument();
    expect(screen.getAllByText('Resume', { selector: '.status-pill' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Continue lesson' })).toHaveAttribute(
      'href',
      '/lessons/slope-refresher',
    );
    expect(screen.getByLabelText('Slope Refresher progress')).toHaveTextContent('43%');
    expect(screen.queryByRole('link', { name: 'Start lesson' })).not.toBeInTheDocument();
  });

  it('unlocks the random practice widget once every lesson is complete', () => {
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({
        completedLessonIds: lessons.map((lesson) => lesson.id),
        dailyCompletionDates: [getTodayKey(0)],
        totalXp: 999,
      }),
    );
    mockedUseAuth.mockReturnValue({
      user: { displayName: 'Maya Johnson', email: 'maya@example.com' } as ReturnType<
        typeof useAuth
      >['user'],
      loading: false,
      isConfigured: true,
      loginWithGoogle: vi.fn(),
      loginWithEmail: vi.fn(),
      signUpWithEmail: vi.fn(),
      logout: vi.fn(),
      deleteAccount: vi.fn(),
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Practice mode unlocked')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start random practice' })).toHaveAttribute(
      'href',
      '/practice',
    );
  });

  it('renders only the three core stat cards without minutes today', () => {
    mockedUseAuth.mockReturnValue({
      user: { displayName: 'Maya Johnson', email: 'maya@example.com' } as ReturnType<
        typeof useAuth
      >['user'],
      loading: false,
      isConfigured: true,
      loginWithGoogle: vi.fn(),
      loginWithEmail: vi.fn(),
      signUpWithEmail: vi.fn(),
      logout: vi.fn(),
      deleteAccount: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(container.querySelectorAll('.stats-grid .stat-card')).toHaveLength(3);
    expect(screen.getByText('Course progress')).toBeInTheDocument();
    expect(screen.getByText('Total XP')).toBeInTheDocument();
    expect(screen.getByText('Current streak')).toBeInTheDocument();
    expect(screen.queryByText('Minutes today')).not.toBeInTheDocument();
  });

  it('renders the streak for each simulated day offset', () => {
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({
        completedLessonIds: ['what-changes'],
        dailyCompletionDates: [getTodayKey(0)],
        dailyStudyMinutes: {
          [getTodayKey(0)]: 9,
          [getTodayKey(1)]: 3,
        },
        totalXp: 125,
      }),
    );
    mockedUseAuth.mockReturnValue({
      user: { displayName: 'Maya Johnson', email: 'maya@example.com' } as ReturnType<
        typeof useAuth
      >['user'],
      loading: false,
      isConfigured: true,
      loginWithGoogle: vi.fn(),
      loginWithEmail: vi.fn(),
      signUpWithEmail: vi.fn(),
      logout: vi.fn(),
      deleteAccount: vi.fn(),
    });

    const { unmount: unmountDayZero } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('1 day')).toBeInTheDocument();

    unmountDayZero();
    window.localStorage.setItem(lessonProgressDayOffsetStorageKey, '1');

    const { unmount: unmountDayOne } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('1 day')).toBeInTheDocument();

    unmountDayOne();
    window.localStorage.setItem(lessonProgressDayOffsetStorageKey, '2');

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('0 days')).toBeInTheDocument();
  });
});

describe('getTimeOfDay', () => {
  it('maps the local hour to a part of day', () => {
    expect(getTimeOfDay(6)).toBe('morning');
    expect(getTimeOfDay(11)).toBe('morning');
    expect(getTimeOfDay(12)).toBe('afternoon');
    expect(getTimeOfDay(16)).toBe('afternoon');
    expect(getTimeOfDay(17)).toBe('evening');
    expect(getTimeOfDay(21)).toBe('evening');
    expect(getTimeOfDay(22)).toBe('night');
    expect(getTimeOfDay(3)).toBe('night');
  });
});

describe('getDashboardGreeting', () => {
  const morning = new Date(2026, 0, 1, 8, 0, 0);

  it('opens with a salutation that matches the local time of day', () => {
    expect(getDashboardGreeting('Maya', morning, 0)).toBe('Good morning, Maya.');
    expect(getDashboardGreeting('Maya', new Date(2026, 0, 1, 14, 0, 0), 0)).toBe(
      'Good afternoon, Maya.',
    );
    expect(getDashboardGreeting('Maya', new Date(2026, 0, 1, 19, 0, 0), 0)).toBe(
      'Good evening, Maya.',
    );
  });

  it('varies with the random value but always names the student', () => {
    const first = getDashboardGreeting('Maya', morning, 0);
    const last = getDashboardGreeting('Maya', morning, 0.999);

    expect(first).not.toBe(last);
    expect(first).toContain('Maya');
    expect(last).toContain('Maya');
  });
});
