import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { coinsSpentStorageKey } from '../games/useCurrency';
import { getTodayKey, lessonProgressStorageKey } from '../lessons/lessonProgress';
import { AnalyticsPage } from './AnalyticsPage';

// Inline fixture course keeps analytics tests independent of authored content.
const { mockLessons } = vi.hoisted(() => {
  function lesson(id: string, title: string, chapterId: string) {
    return {
      id,
      chapterId,
      title,
      description: `${title} description`,
      status: 'available',
      estimatedMinutes: 5,
      steps: [
        { id: `${id}-c0`, type: 'concept', title: 'Concept', body: 'Body.' },
        {
          id: `${id}-q0`,
          type: 'multiple-choice',
          title: 'Question',
          prompt: 'Prompt',
          options: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
          correctOptionId: 'a',
          correctExplanation: 'Yes.',
          incorrectExplanation: 'No.',
        },
      ],
    };
  }

  return {
    mockLessons: [
      lesson('what-changes', 'What Changes?', 'functions-and-graphs'),
      lesson('slope-refresher', 'Slope Refresher', 'functions-and-graphs'),
    ],
  };
});

vi.mock('../data/lessons', () => ({
  lessons: mockLessons,
  getLessonById: (id: string) => mockLessons.find((lesson) => lesson.id === id),
  getChapterLessons: (chapterId: string) =>
    mockLessons.filter((lesson) => lesson.chapterId === chapterId),
  getChapterForLesson: () => undefined,
}));

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
    updateDisplayName: vi.fn(),
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
    expect(statCard('Lessons completed')).toHaveTextContent(`0 / ${mockLessons.length}`);
    // No attempts recorded yet → accuracy shows a dash, not a misleading 0%.
    expect(statCard('Accuracy')).toHaveTextContent('-');
    expect(statCard('Accuracy')).not.toHaveTextContent('0%');
    expect(statCard('Minutes today')).toHaveTextContent('0 min');
    expect(screen.getByText('Lv 1')).toBeInTheDocument();
    // No progress yet → both currencies read zero.
    expect(statCard('Coin balance')).toHaveTextContent('0');
    expect(statCard('Total XP')).toHaveTextContent('0');
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
        totalXp: 450,
        // Coins are a separate accumulation, scarcer than XP (46, not the 450 XP).
        totalCoinsEarned: 46,
      }),
    );

    renderAnalytics();

    expect(statCard('Lessons completed')).toHaveTextContent(`1 / ${mockLessons.length}`);
    /* 5 attempts (4 correct) + 1 awarded question with no attempt → 6 attempted, 5 correct. */
    expect(statCard('Questions attempted')).toHaveTextContent('6');
    expect(statCard('Questions answered correctly')).toHaveTextContent('5');
    expect(screen.queryByText('Avg attempts / question')).not.toBeInTheDocument();
    // Accuracy is consistent with the counts: 5 correct / 6 attempted = 83%.
    expect(statCard('Accuracy')).toHaveTextContent('83%');
    // 8 + 12 minutes of all-time study.
    expect(statCard('Total study time')).toHaveTextContent('20 min');
    expect(statCard('Minutes today')).toHaveTextContent('12 min');
    expect(statCard('Days active this week')).toHaveTextContent('2 / 7');
    /* 450 XP → Level 2 (Level 1→2 costs 250); 200 XP remain to Level 3 (Level 2→3 costs 400). */
    expect(screen.getByText('Lv 2')).toBeInTheDocument();
    expect(screen.getByText(/200 XP to Level 3/)).toBeInTheDocument();
    /* Coins are tracked separately from XP: nothing spent → balance = lifetime earned (46), independent of XP. */
    expect(statCard('Coin balance')).toHaveTextContent('46');
    expect(statCard('Coin balance')).toHaveTextContent('46 earned');
    expect(statCard('Coin balance')).toHaveTextContent('0 spent');
    expect(statCard('Total XP')).toHaveTextContent('450');
  });

  it('caps "Lessons completed" at the course total when stale/legacy ids are stored', () => {
    /* completedLessonIds holds both real course lessons plus stale ids from
     * renamed/removed lessons. The raw array length is 4, but the course only has
     * mockLessons.length (2) lessons — the numerator must intersect with the live
     * course so it reads "2 / 2", never the over-counted "4 / 2". */
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({
        completedLessonIds: [
          'what-changes',
          'slope-refresher',
          'legacy-removed-1',
          'legacy-renamed-2',
        ],
        dailyCompletionDates: [getTodayKey(0)],
        totalXp: 250,
      }),
    );

    renderAnalytics();

    const lessonsCompletedCard = statCard('Lessons completed');
    // Numerator is course-intersected and capped at the total (2 / 2), not 4 / 2.
    expect(lessonsCompletedCard).toHaveTextContent(`${mockLessons.length} / ${mockLessons.length}`);
    expect(lessonsCompletedCard).not.toHaveTextContent(`4 / ${mockLessons.length}`);
  });

  it('reflects arcade spending in the coin balance while XP stays the lifetime total', () => {
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({
        completedLessonIds: ['what-changes'],
        dailyCompletionDates: [getTodayKey(0)],
        totalXp: 125,
        // Lifetime coins earned is its own total (90), distinct from the 125 XP.
        totalCoinsEarned: 90,
      }),
    );
    // 40 coins already spent in the arcade.
    window.localStorage.setItem(coinsSpentStorageKey, '40');

    renderAnalytics();

    /* Balance = 90 earned − 40 spent = 50; XP is separate and unaffected. */
    expect(statCard('Coin balance')).toHaveTextContent('50');
    expect(statCard('Coin balance')).toHaveTextContent('90 earned');
    expect(statCard('Coin balance')).toHaveTextContent('40 spent');
    expect(statCard('Total XP')).toHaveTextContent('125');
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
    expect(screen.getAllByText('Not completed yet')).toHaveLength(mockLessons.length - 1);
  });
});
