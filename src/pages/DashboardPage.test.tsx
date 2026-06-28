import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { chapters } from '../data/chapters';
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

/* Real chapters, mocked lessons: two in the first chapter, one in the second, the rest empty to exercise the "coming soon" path. */
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
      lesson('what-changes', 'What Changes?', 'limits'),
      lesson('slope-refresher', 'Slope Refresher', 'limits'),
      lesson('intro-derivatives', 'Intro to Derivatives', 'derivatives'),
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

/* Pin the gate ENFORCEMENT flag ON so the gated-dashboard tests exercise the real
 * gated state regardless of the production default. The other tests here either pass
 * today's gate or have no completed lessons, so the gate is inactive for them
 * regardless of the flag. The pure predicate stays real. */
vi.mock('../lessons/dailyGate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lessons/dailyGate')>();
  return { ...actual, DAILY_GATE_ENABLED: true };
});

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

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

function statCard(label: string) {
  return screen.getByText(label).closest('.stat-card') as HTMLElement;
}

function chapterCard(title: string) {
  return screen.getByText(title).closest('.chapter-card') as HTMLElement;
}

describe('getStudentFirstName', () => {
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

describe('DashboardPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockSignedInUser();
  });

  it('greets the student and lays out the course as chapters', () => {
    renderDashboard();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Maya');
    // Every chapter renders as a section (real chapter list, stable foundation).
    expect(screen.getByText('Limits')).toBeInTheDocument();
    expect(screen.getByText('Derivatives')).toBeInTheDocument();
    expect(screen.getByText('Sequences and Series')).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(chapters.length);
  });

  it('shows a coming-soon note for chapters that have no lessons yet', () => {
    renderDashboard();

    // Two chapters have fixture lessons; the rest show the placeholder.
    expect(screen.getAllByText('Lessons coming soon.')).toHaveLength(chapters.length - 2);
  });

  it('links the first available lesson and renders its chapter lessons', () => {
    const { container } = renderDashboard();

    expect(screen.getByRole('link', { name: /Next up/ })).toHaveAttribute(
      'href',
      '/lessons/what-changes',
    );
    // The available lesson is a link; the still-locked lesson is not.
    expect(container.querySelector('a[href="/lessons/what-changes"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/lessons/slope-refresher"]')).toBeNull();

    const limitsChapter = chapterCard('Limits');
    expect(limitsChapter).toHaveTextContent('What Changes?');
    expect(limitsChapter).toHaveTextContent('Slope Refresher');
    expect(limitsChapter).toHaveTextContent('0 / 2 lessons');
  });

  it('renders the four core stat cards (XP level merged with Total XP) and a practice hub call-to-action', () => {
    const { container } = renderDashboard();

    /* Four cards now: Course progress, XP level (with Total XP folded in), Coins, Current streak. */
    expect(container.querySelectorAll('.stats-grid .stat-card')).toHaveLength(4);
    expect(screen.getByText('Course progress')).toBeInTheDocument();
    expect(screen.getByText('XP level')).toBeInTheDocument();
    expect(screen.getByText('Coins')).toBeInTheDocument();
    expect(screen.getByText('Current streak')).toBeInTheDocument();
    expect(screen.queryByText('Minutes today')).not.toBeInTheDocument();

    /* Total XP isn't its own card; it lives inside the XP-level card with the ring + "to next level" status. */
    expect(screen.queryByText('Total XP')).not.toBeInTheDocument();
    const xpLevelCard = statCard('XP level');
    expect(xpLevelCard).toHaveTextContent('total XP');
    // With no XP yet the lifetime total reads 0 inside the merged card.
    expect(xpLevelCard.querySelector('.stat-card-total-xp-value')).toHaveTextContent('0');

    /* XP-level card mirrors analytics via the shared curve: no XP → Level 1 needing the full first level (250 XP). */
    expect(xpLevelCard).toHaveTextContent('Lv 1');
    expect(xpLevelCard).toHaveTextContent('250 XP to Level 2');

    // Practice CTA points at the unified practice, gated until a lesson is done.
    const practiceCta = screen.getByRole('link', { name: 'View practice' });
    expect(practiceCta).toHaveAttribute('href', '/practice');
    expect(
      screen.getByText(/Complete a lesson to unlock mixed practice/),
    ).toBeInTheDocument();
  });

  it('places the four stat displays in a single row, with Total XP merged into the XP-level card', () => {
    const { container } = renderDashboard();

    /* All four displays are direct children of one .stats-grid (the single row), in order, no standalone Total XP card. */
    const rowCards = container.querySelectorAll('.stats-grid > .stat-card');
    expect(rowCards).toHaveLength(4);

    const labels = Array.from(container.querySelectorAll('.stats-grid > .stat-card .stat-card-label')).map(
      (label) => label.textContent?.trim(),
    );
    expect(labels).toEqual(['Course progress', 'XP level', 'Coins', 'Current streak']);
  });

  it('unlocks practice once any single lesson is complete and tracks chapter progress', () => {
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({
        // Only one of Limits' two lessons is done.
        completedLessonIds: ['what-changes'],
        dailyCompletionDates: [getTodayKey(0)],
        // Pass today's gate so the dashboard renders its unlocked (non-gated) state.
        requiredPracticePassedDates: [getTodayKey(0)],
        totalXp: 125,
      }),
    );

    renderDashboard();

    // Finishing a single lesson unlocks the unified practice (no full chapter needed).
    expect(screen.getByRole('link', { name: 'Go to practice' })).toHaveAttribute('href', '/practice');

    const limitsChapter = chapterCard('Limits');
    expect(limitsChapter).toHaveTextContent('1 / 2 lessons');
    expect(limitsChapter).toHaveTextContent('50% complete');
    /* No per-chapter "Practice" shortcut; practice is only the single mixed-practice CTA above the list. */
    expect(screen.queryByRole('link', { name: 'Practice' })).not.toBeInTheDocument();

    // An untouched chapter shows progress but no practice link.
    const derivativesChapter = chapterCard('Derivatives');
    expect(derivativesChapter).toHaveTextContent('0 / 1 lesson');

    // Course progress folds in the one finished lesson out of three: 33%.
    expect(statCard('Course progress')).toHaveTextContent('33%');
    // Total XP now lives inside the merged XP-level card.
    expect(statCard('XP level').querySelector('.stat-card-total-xp-value')).toHaveTextContent('125');
  });

  it('unlocks mixed practice once an entire chapter is complete', () => {
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({
        // Both Limits lessons finished -> the chapter is complete.
        completedLessonIds: ['what-changes', 'slope-refresher'],
        dailyCompletionDates: [getTodayKey(0)],
        // Pass today's gate so the dashboard renders its unlocked (non-gated) state.
        requiredPracticePassedDates: [getTodayKey(0)],
        totalXp: 250,
      }),
    );

    renderDashboard();

    // The CTA copy switches to the "available" wording and the unified link.
    expect(screen.getByRole('link', { name: 'Go to practice' })).toHaveAttribute(
      'href',
      '/practice',
    );

    const limitsChapter = chapterCard('Limits');
    expect(limitsChapter).toHaveTextContent('2 / 2 lessons');
    expect(limitsChapter).toHaveTextContent('100% complete');

    // No per-chapter "Practice" link is rendered, even for a fully completed chapter.
    expect(screen.queryByRole('link', { name: 'Practice' })).not.toBeInTheDocument();

    // An incomplete chapter still has no practice link.
    const derivativesChapter = chapterCard('Derivatives');
    expect(derivativesChapter).toHaveTextContent('0 / 1 lesson');

    // Course progress folds in the two finished lessons out of three: 67%.
    expect(statCard('Course progress')).toHaveTextContent('67%');
  });

  it('renders the streak for each simulated day offset', () => {
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({
        completedLessonIds: ['what-changes'],
        // Streak now counts days the required practice was passed.
        requiredPracticePassedDates: [getTodayKey(0)],
        dailyStudyMinutes: {
          [getTodayKey(0)]: 9,
          [getTodayKey(1)]: 3,
        },
        totalXp: 125,
      }),
    );

    const { unmount: unmountDayZero } = renderDashboard();
    expect(screen.getByText('1 day')).toBeInTheDocument();
    unmountDayZero();

    window.localStorage.setItem(lessonProgressDayOffsetStorageKey, '1');
    const { unmount: unmountDayOne } = renderDashboard();
    expect(screen.getByText('1 day')).toBeInTheDocument();
    unmountDayOne();

    window.localStorage.setItem(lessonProgressDayOffsetStorageKey, '2');
    renderDashboard();
    expect(screen.getByText('0 days')).toBeInTheDocument();
  });

  it('renders the dashboard but GRAYS OUT / disables lesson buttons while today\u2019s required practice is unfinished', () => {
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({
        completedLessonIds: ['what-changes'],
        dailyCompletionDates: [getTodayKey(0)],
        // No requiredPracticePassedDates today → the daily gate is active.
        totalXp: 125,
      }),
    );

    const { container } = renderDashboard();

    // NEW MODEL: the dashboard still RENDERS (it is not redirected away) — heading
    // and chapter content are present.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Maya');
    expect(screen.getByText('Limits')).toBeInTheDocument();

    // A prominent banner funnels the learner to the required practice.
    expect(screen.getByText('Daily practice required')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start required practice' })).toHaveAttribute(
      'href',
      '/practice',
    );

    // COMPLETED lessons stay REVIEWABLE while gated: the finished lesson keeps a
    // live link, but the not-yet-completed lesson does not (it grays out instead).
    expect(container.querySelector('a[href="/lessons/what-changes"]')).not.toBeNull();
    expect(container.querySelector('a[href="/lessons/slope-refresher"]')).toBeNull();
    // The live "Next up" callout (an incomplete lesson) is gone — grayed out instead.
    expect(screen.queryByRole('link', { name: /Next up/ })).not.toBeInTheDocument();

    const lockedButtons = screen.getAllByRole('button', {
      name: 'Complete daily practice to unlock',
    });
    // The "next up" CTA + the not-yet-completed trail stop (the completed stop stays a link).
    expect(lockedButtons.length).toBeGreaterThanOrEqual(2);
    for (const button of lockedButtons) {
      expect(button).toBeDisabled();
    }
  });

  it('keeps lesson navigation interactive once today\u2019s required practice is passed', () => {
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({
        completedLessonIds: ['what-changes'],
        dailyCompletionDates: [getTodayKey(0)],
        // Today's gate is passed → buttons re-enable, lesson links return.
        requiredPracticePassedDates: [getTodayKey(0)],
        totalXp: 125,
      }),
    );

    const { container } = renderDashboard();

    // No gate banner, the live "Next up" link is back, and trail lesson links work.
    expect(screen.queryByText('Daily practice required')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Next up/ })).toBeInTheDocument();
    expect(container.querySelector('a[href^="/lessons/"]')).not.toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Complete daily practice to unlock' }),
    ).not.toBeInTheDocument();
  });
});
