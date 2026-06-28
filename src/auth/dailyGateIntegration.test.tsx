import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from './AuthContext';
import { DailyGateRoute } from './DailyGateRoute';
import { LessonGate } from './LessonGate';
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
    /* lesson-a is the COMPLETED lesson (reviewable while gated); lesson-b stays
       INCOMPLETE so a direct visit to it is blocked while the gate is active. */
    mockLessons: [lesson('lesson-a', 'limits', 'Lesson A'), lesson('lesson-b', 'limits', 'Lesson B')],
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

/* LessonGate renders the real LessonPage when a lesson is reachable; stub it to a
   lightweight placeholder so these tests isolate the GATE decision (review vs block),
   not the lesson player itself. */
vi.mock('../pages/LessonPage', () => ({ LessonPage: () => <div>Lesson child</div> }));

/* This suite reproduces the gate behavior end-to-end, so PIN the ENFORCEMENT flag ON
 * (independent of the production default). The pure predicate stays real. */
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

/* Mirrors the NEW App.tsx model: /practice AND the list page /dashboard are OUTSIDE
   the gate (the dashboard renders with locked buttons), while lessons/:lessonId is
   gated PER-LESSON by LessonGate — a COMPLETED lesson renders for review, an
   INCOMPLETE one shows the banner-only blocked screen until today's set is passed. */
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
          <Route path="dashboard" element={<div>Dashboard child</div>} />
          <Route path="lessons/:lessonId" element={<LessonGate />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/* Mirrors App.tsx's Slipstream wiring: the race HOME (/race) sits OUTSIDE the gate
   (it renders with disabled start buttons), while a direct link into an ACTIVE
   match (/race/:matchId) stays INSIDE DailyGateRoute — now rendering the banner-only
   blocked screen IN PLACE (not a redirect) until today's set is passed. Placeholder
   elements isolate the ROUTING. */
function renderRaceModel(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="practice" element={<div>Required practice</div>} />
        <Route path="race" element={<div>Slipstream home</div>} />
        <Route element={<DailyGateRoute />}>
          <Route path="race/:matchId" element={<div>Active match</div>} />
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
  it('blocks a direct visit to an INCOMPLETE lesson with the banner-only screen while gated', () => {
    setGatedProgress();
    renderApp('/lessons/lesson-b');

    // lesson-b is not completed → the shared banner renders IN PLACE; the learner is
    // NOT shown the lesson and is NOT redirected into /practice.
    expect(screen.getByText('Daily practice required')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start required practice' })).toHaveAttribute(
      'href',
      '/practice',
    );
    expect(screen.queryByText('Lesson child')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Practice progress')).not.toBeInTheDocument();
  });

  it('renders a COMPLETED lesson for review (no banner) even while gated', () => {
    setGatedProgress();
    renderApp('/lessons/lesson-a');

    // Review is allowed: lesson-a is completed, so it renders normally — no banner,
    // no redirect into /practice.
    expect(screen.getByText('Lesson child')).toBeInTheDocument();
    expect(screen.queryByText('Daily practice required')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Practice progress')).not.toBeInTheDocument();
  });

  it('renders a LIST page (dashboard) WITHOUT redirecting while gated', () => {
    setGatedProgress();
    renderApp('/dashboard');

    // The dashboard is NOT behind the gate — it renders (with its own locked
    // buttons) rather than bouncing to /practice.
    expect(screen.getByText('Dashboard child')).toBeInTheDocument();
    expect(screen.queryByLabelText('Practice progress')).not.toBeInTheDocument();
  });

  it('does NOT gate a lesson route when the completed lesson is absent from the live course', () => {
    /* completedLessonIds references a lesson that no longer exists in the course
     * (e.g. renamed/removed across a deploy, or a stale persisted id) but still
     * resolves to bank questions. A raw-id check would gate, while PracticePage
     * (course-intersected) shows "Complete a lesson" → infinite loop. The fail-safe
     * intersects with the live course, so the gate is inactive and the lesson renders. */
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
      renderApp('/lessons/lesson-a');
      // The gate is inactive (fail-safe), so the lesson renders — no banner screen.
      expect(screen.getByText('Lesson child')).toBeInTheDocument();
      expect(screen.queryByText('Daily practice required')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Practice progress')).not.toBeInTheDocument();
    } finally {
      mockQuestions.pop();
    }
  });

  it('unlocks a blocked (incomplete) lesson route after passing at >= 85%', async () => {
    const user = userEvent.setup();
    setGatedProgress();
    const { unmount } = renderApp('/lessons/lesson-b');

    // Blocked with the banner; follow its CTA into the required set.
    expect(screen.getByText('Daily practice required')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Start required practice' }));

    // Now on /practice (gate mode): answer all 4 correctly (100% >= 85%).
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 1 of 4');
    for (let index = 0; index < 4; index += 1) {
      await answerCorrectly(user);
      await user.click(
        screen.getByRole('button', { name: index < 3 ? 'Next' : 'View summary' }),
      );
    }

    // The pass summary unlocks the app (today's pass is now persisted).
    expect(screen.getByRole('heading', { name: /Daily practice complete/ })).toBeInTheDocument();
    unmount();

    // A fresh direct navigation to the once-blocked lesson now renders it (gate cleared).
    renderApp('/lessons/lesson-b');
    await waitFor(() => expect(screen.getByText('Lesson child')).toBeInTheDocument());
    expect(screen.queryByText('Daily practice required')).not.toBeInTheDocument();
  });

  it('renders the Slipstream race HOME WITHOUT redirecting while gated', () => {
    setGatedProgress();
    renderRaceModel('/race');

    // /race is NOT behind the gate — it renders (with its own disabled start
    // buttons) rather than bouncing to /practice.
    expect(screen.getByText('Slipstream home')).toBeInTheDocument();
    expect(screen.queryByText('Daily practice required')).not.toBeInTheDocument();
    expect(screen.queryByText('Required practice')).not.toBeInTheDocument();
  });

  it('shows the banner-only blocked screen for a direct ACTIVE-match URL (race/:matchId) while gated', () => {
    setGatedProgress();
    renderRaceModel('/race/ABCDE');

    // Defense-in-depth: a deep link into a live match shows the banner IN PLACE
    // (games/races aren't reviewable) instead of the match — and no redirect.
    expect(screen.getByText('Daily practice required')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start required practice' })).toHaveAttribute(
      'href',
      '/practice',
    );
    expect(screen.queryByText('Active match')).not.toBeInTheDocument();
  });
});
