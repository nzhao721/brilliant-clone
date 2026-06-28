import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from './AuthContext';
import { DailyGateRoute } from './DailyGateRoute';
import { createSeededRng } from '../data/questionBank';
import { getTodayKey, lessonProgressStorageKey } from '../lessons/lessonProgress';
import { PracticePage } from '../pages/PracticePage';

/*
 * END-TO-END reproduction of the daily-gate trap. Uses the REAL useLessonProgress
 * hook + REAL routing (/practice OUTSIDE the gate, /dashboard INSIDE it), so the
 * write done on /practice must flip the gate's read on the very next navigation.
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

vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }));

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

function setGatedProgress() {
  window.localStorage.setItem(
    lessonProgressStorageKey,
    JSON.stringify({
      completedLessonIds: ['lesson-a'],
      lessonCompletedAt: { 'lesson-a': `${getTodayKey(0)}T00:00:00.000Z` },
      dailyCompletionDates: [],
      requiredPracticePassedDates: [],
      totalXp: 0,
    }),
  );
}

/* Mirrors App.tsx: /practice is OUTSIDE the gate; /dashboard is INSIDE it. */
function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          element={
            <>
              <Outlet />
            </>
          }
        >
          <Route path="practice" element={<PracticePage rng={createSeededRng(7)} />} />
          <Route element={<DailyGateRoute />}>
            <Route path="dashboard" element={<div>Dashboard child</div>} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

async function answerCorrectly(user: ReturnType<typeof userEvent.setup>) {
  await user.click(document.querySelector('input[type="radio"][value="a"]') as HTMLElement);
  await user.click(screen.getByRole('button', { name: 'Submit' }));
}

beforeEach(() => {
  window.localStorage.clear();
  playEffectMock.mockClear();
  delete (window.navigator as { onLine?: boolean }).onLine;
  mockedUseAuth.mockReturnValue({ user: { uid: 'tester' } } as ReturnType<typeof useAuth>);
});

describe('daily gate integration (real hook + routing)', () => {
  it('bounces a gated user from /dashboard to the required practice', () => {
    setGatedProgress();
    renderApp('/dashboard');

    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 1 of 4');
    expect(screen.queryByText('Dashboard child')).not.toBeInTheDocument();
  });

  it('does NOT trap when a completed lesson id is absent from the live course', () => {
    /* completedLessonIds references a lesson that no longer exists in the course
     * (e.g. renamed/removed across a deploy, or a stale persisted id) but still
     * resolves to bank questions. DailyGateRoute (raw ids) would gate, while
     * PracticePage (course-intersected) shows "Complete a lesson" → infinite loop.
     * The fail-safe must let the learner through instead. */
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({
        completedLessonIds: ['ghost-lesson'],
        dailyCompletionDates: [],
        requiredPracticePassedDates: [],
        totalXp: 0,
      }),
    );
    // A ghost question exists for the missing lesson, so the raw-id pool is non-empty.
    mockQuestions.push({
      id: 'ghost-q',
      chapterId: 'limits',
      lessonId: 'ghost-lesson',
      category: 'sample',
      prompt: 'Ghost prompt: $x$',
      choices: [
        { id: 'a', label: 'Choice A' },
        { id: 'b', label: 'Choice B' },
      ],
      correctChoiceId: 'a',
      explanation: 'Because A is correct.',
    });

    try {
      renderApp('/dashboard');
      // Must NOT be stranded on /practice; the child renders instead of looping.
      expect(screen.getByText('Dashboard child')).toBeInTheDocument();
    } finally {
      mockQuestions.pop();
    }
  });

  it('unlocks the app on the next navigation after passing at >= 85%', async () => {
    const user = userEvent.setup();
    setGatedProgress();
    renderApp('/dashboard');

    // Redirected into the required set; answer all 4 correctly (100% >= 85%).
    for (let index = 0; index < 4; index += 1) {
      await answerCorrectly(user);
      await user.click(
        screen.getByRole('button', { name: index < 3 ? 'Next random question' : 'View summary' }),
      );
    }

    // The pass summary unlocks the app.
    expect(screen.getByRole('heading', { name: /Daily practice complete/ })).toBeInTheDocument();

    // Navigating to the dashboard must NOT bounce back to /practice.
    await user.click(screen.getByRole('link', { name: 'Continue to dashboard' }));
    await waitFor(() => expect(screen.getByText('Dashboard child')).toBeInTheDocument());
    expect(screen.queryByLabelText('Practice progress')).not.toBeInTheDocument();
  });
});
