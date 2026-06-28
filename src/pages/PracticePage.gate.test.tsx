import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { createSeededRng } from '../data/questionBank';
import { dateKeyToDayNumber, dayNumberToDateKey } from '../lessons/dayMath';
import { getTodayKey, lessonProgressStorageKey } from '../lessons/lessonProgress';
import { PracticePage } from './PracticePage';

/*
 * DAILY-REQUIRED gate mode. AI is OFF in the test runner, so the gate is the
 * static required set only (still passable). One completed, SR-due lesson with
 * four questions makes the required set a deterministic 4 questions, every correct
 * answer being "a".
 */

const { mockLessons, mockQuestions } = vi.hoisted(() => {
  function lesson(id: string, chapterId: string, title: string) {
    return {
      id,
      chapterId,
      title,
      description: `${title} description`,
      status: 'available',
      estimatedMinutes: 5,
      steps: [],
    };
  }

  function question(id: string, chapterId: string, lessonId: string) {
    return {
      id,
      chapterId,
      lessonId,
      category: 'sample',
      prompt: `Prompt for ${id}: $x$`,
      choices: [
        { id: 'a', label: 'Choice A' },
        { id: 'b', label: 'Choice B' },
      ],
      correctChoiceId: 'a',
      explanation: 'Because A is correct.',
    };
  }

  return {
    mockLessons: [lesson('lesson-a', 'limits', 'Lesson A')],
    mockQuestions: Array.from({ length: 4 }, (_unused, index) =>
      question(`qa-${index}`, 'limits', 'lesson-a'),
    ),
  };
});

vi.mock('../data/lessons', () => ({
  lessons: mockLessons,
  getLessonById: (id: string) => mockLessons.find((lesson) => lesson.id === id),
  getChapterLessons: (chapterId: string) =>
    mockLessons.filter((lesson) => lesson.chapterId === chapterId),
  getChapterForLesson: () => undefined,
}));

vi.mock('../data/questionBank', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/questionBank')>();
  return {
    ...actual,
    questionBank: mockQuestions,
    getQuestionsForLessons: (lessonIds: Iterable<string>, source = mockQuestions) => {
      const lessonIdSet = new Set(lessonIds);
      return lessonIdSet.size === 0
        ? []
        : source.filter(
            (question) => question.lessonId != null && lessonIdSet.has(question.lessonId),
          );
    },
  };
});

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }));

/* Pin the gate ENFORCEMENT flag ON so PracticePage runs in gate mode here,
 * independent of the production default. */
vi.mock('../lessons/dailyGate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lessons/dailyGate')>();
  return { ...actual, DAILY_GATE_ENABLED: true };
});

vi.mock('../lessons/useAiTutor', () => ({
  useAiTutor: vi.fn(() => ({
    loading: false,
    result: null,
    error: false,
    active: false,
    requestHint: vi.fn(),
  })),
}));

const playEffectMock = vi.hoisted(() => vi.fn());
vi.mock('../audio/SoundProvider', () => ({
  useSound: () => ({
    playEffect: playEffectMock,
    playCustom: vi.fn(),
    startMusic: vi.fn(),
    stopMusic: vi.fn(),
    isMuted: false,
    toggleMute: vi.fn(),
    volume: 1,
    setVolume: vi.fn(),
  }),
}));

const mockedUseAuth = vi.mocked(useAuth);

/** A completed, SR-due lesson with the daily gate UNPASSED → gate mode is active. */
function setGatedProgress() {
  const today = getTodayKey(0);
  const fiveDaysAgo = dayNumberToDateKey((dateKeyToDayNumber(today) as number) - 5) as string;
  // Anchor at LOCAL noon so the completion-day (the local day of the instant) is
  // exactly five days ago in any timezone — the SR anchor is local, not UTC.
  const [fy, fm, fd] = fiveDaysAgo.split('-').map(Number);
  const completedAtIso = new Date(fy, fm - 1, fd, 12, 0, 0, 0).toISOString();
  window.localStorage.setItem(
    lessonProgressStorageKey,
    JSON.stringify({
      completedLessonIds: ['lesson-a'],
      lessonCompletedAt: { 'lesson-a': completedAtIso },
      dailyCompletionDates: [],
      requiredPracticePassedDates: [],
      totalXp: 0,
    }),
  );
}

function renderGatePractice() {
  return render(
    <MemoryRouter>
      <PracticePage rng={createSeededRng(7)} />
    </MemoryRouter>,
  );
}

async function answer(user: ReturnType<typeof userEvent.setup>, value: 'a' | 'b') {
  await user.click(document.querySelector(`input[type="radio"][value="${value}"]`) as HTMLElement);
  await user.click(screen.getByRole('button', { name: 'Submit' }));
}

function storedProgress() {
  return JSON.parse(window.localStorage.getItem(lessonProgressStorageKey) ?? '{}');
}

beforeEach(() => {
  window.localStorage.clear();
  playEffectMock.mockClear();
  delete (window.navigator as { onLine?: boolean }).onLine;
  mockedUseAuth.mockReturnValue({
    user: { uid: 'tester' } as ReturnType<typeof useAuth>['user'],
    loading: false,
    isConfigured: true,
    loginWithGoogle: vi.fn(),
    loginWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    logout: vi.fn(),
    updateDisplayName: vi.fn(),
    deleteAccount: vi.fn(),
  } as ReturnType<typeof useAuth>);
});

describe('PracticePage daily gate', () => {
  it('opens directly into the required set with no dashboard escape', () => {
    setGatedProgress();
    renderGatePractice();

    // The required set (4 questions, AI off) shows immediately.
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 1 of 4');
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    // No "back to dashboard" escape while answering the gate.
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
  });

  it('passes at >= 85%: records the pass date, advances SR, and unlocks', async () => {
    const user = userEvent.setup();
    setGatedProgress();
    renderGatePractice();

    for (let index = 0; index < 4; index += 1) {
      await answer(user, 'a');
      await user.click(
        screen.getByRole('button', { name: index < 3 ? 'Next' : 'View summary' }),
      );
    }

    // Pass summary unlocks the rest of the app.
    expect(screen.getByRole('heading', { name: /Daily practice complete/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );

    const stored = storedProgress();
    // The pass date (which drives the streak) is recorded for today...
    expect(stored.requiredPracticePassedDates).toContain(getTodayKey(0));
    // ...and the served SR topic advanced (anchored 5 days ago → next interval index 2).
    expect(stored.spacedRepetition['lesson-a'].intervalIndex).toBe(2);
  });

  it('fails below 85% and "Try again" regenerates a fresh set without passing', async () => {
    const user = userEvent.setup();
    setGatedProgress();
    renderGatePractice();

    // 3 correct + 1 wrong = 75% < 85%.
    for (let index = 0; index < 4; index += 1) {
      await answer(user, index < 3 ? 'a' : 'b');
      await user.click(
        screen.getByRole('button', { name: index < 3 ? 'Next' : 'View summary' }),
      );
    }

    expect(screen.getByRole('heading', { name: /Keep going/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    // The gate is NOT passed: no pass date, SR untouched.
    const afterFail = storedProgress();
    expect(afterFail.requiredPracticePassedDates ?? []).toHaveLength(0);
    expect(afterFail.spacedRepetition ?? {}).toEqual({});

    // "Try again" rebuilds a fresh required set and restarts the loop.
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 1 of 4');
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });
});
