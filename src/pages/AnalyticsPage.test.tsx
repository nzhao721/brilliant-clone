import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { lessons } from '../data/lessons';
import { getTodayKey, lessonProgressStorageKey } from '../lessons/lessonProgress';
import { AnalyticsPage } from './AnalyticsPage';

vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

function mockSignedInUser() {
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
}

function renderAnalytics() {
  return render(
    <MemoryRouter>
      <AnalyticsPage />
    </MemoryRouter>,
  );
}

function statCard(label: string) {
  return screen.getByText(label).closest('.stat-card') as HTMLElement;
}

describe('AnalyticsPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockSignedInUser();
  });

  it('renders empty-state analytics with no recorded progress', () => {
    renderAnalytics();

    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeInTheDocument();
    expect(statCard('Lessons completed')).toHaveTextContent(`0 / ${lessons.length}`);
    // No attempts recorded yet → accuracy shows a dash, not a misleading 0%.
    expect(statCard('Accuracy')).toHaveTextContent('—');
    expect(statCard('Accuracy')).not.toHaveTextContent('0%');
    expect(statCard('Minutes today')).toHaveTextContent('0 min');
    expect(screen.getByText('Lv 1')).toBeInTheDocument();
  });

  it('renders the global analytics cards from recorded progress', () => {
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({
        awardedQuestionIds: {
          'what-changes': [
            'table-change',
            'input-change',
            'output-change',
            'direction-of-change',
            'average-change',
          ],
        },
        completedLessonIds: ['what-changes'],
        dailyCompletionDates: [getTodayKey(-1), getTodayKey(0)],
        dailyStudyMinutes: {
          [getTodayKey(-1)]: 8,
          [getTodayKey(0)]: 12,
        },
        lessonCompletedAt: {
          'what-changes': '2026-06-23T10:00:00.000Z',
        },
        lessonTimeSpentMs: {
          'what-changes': 420_000,
        },
        questionAttempts: {
          'table-change': { correct: 1, incorrect: 1 },
          'input-change': { correct: 1, incorrect: 0 },
          'output-change': { correct: 1, incorrect: 0 },
          'direction-of-change': { correct: 1, incorrect: 0 },
        },
        totalXp: 125,
      }),
    );

    renderAnalytics();

    expect(statCard('Lessons completed')).toHaveTextContent(`1 / ${lessons.length}`);
    // 5 recorded attempts (4 correct) + 1 awarded lesson question with no
    // recorded attempt ("average-change") → 6 attempted, 5 answered correctly.
    expect(statCard('Questions attempted')).toHaveTextContent('6');
    expect(statCard('Questions answered correctly')).toHaveTextContent('5');
    expect(screen.queryByText('Avg attempts / question')).not.toBeInTheDocument();
    // Accuracy is consistent with the counts: 5 correct / 6 attempted = 83%.
    expect(statCard('Accuracy')).toHaveTextContent('83%');
    // 8 + 12 minutes of all-time study.
    expect(statCard('Total study time')).toHaveTextContent('20 min');
    expect(statCard('Minutes today')).toHaveTextContent('12 min');
    expect(statCard('Days active this week')).toHaveTextContent('2 / 7');
    // 125 XP → Level 2 (the first 100 XP reaches it); 125 XP remain to Level 3
    // on the progressive curve (Level 2 → 3 costs 150).
    expect(screen.getByText('Lv 2')).toBeInTheDocument();
    expect(screen.getByText(/XP to Level 3/)).toBeInTheDocument();
  });

  it('renders the per-lesson breakdown with completion date and time spent', () => {
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({
        completedLessonIds: ['what-changes'],
        dailyCompletionDates: [getTodayKey(0)],
        lessonCompletedAt: {
          'what-changes': '2026-06-23T10:00:00.000Z',
        },
        lessonTimeSpentMs: {
          'what-changes': 420_000,
        },
        totalXp: 125,
      }),
    );

    renderAnalytics();

    const completedRow = screen.getByText('Completed Jun 23').closest('.lesson-breakdown-row') as
      | HTMLElement
      | null;

    expect(completedRow).not.toBeNull();
    expect(completedRow as HTMLElement).toHaveTextContent('1. What Changes?');
    expect(completedRow as HTMLElement).toHaveTextContent('7 min');
    // Every lesson that is not complete shows the placeholder.
    expect(screen.getAllByText('Not completed yet')).toHaveLength(lessons.length - 1);
  });
});
