import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonProgress } from '../lessons/lessonProgress';
import { DailyGateRoute } from './DailyGateRoute';
import { useAuth } from './AuthContext';

vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }));

/* The hook + question pool are stubbed so each test drives progress directly. */
const { useLessonProgressMock, getQuestionsForLessonsMock } = vi.hoisted(() => ({
  useLessonProgressMock: vi.fn(),
  getQuestionsForLessonsMock: vi.fn(),
}));

vi.mock('../lessons/lessonProgress', () => ({ useLessonProgress: useLessonProgressMock }));
/* A realistic 2-lesson course: DailyGateRoute intersects completedLessonIds with
 * the LIVE course (mirroring PracticePage) before deciding to gate. */
vi.mock('../data/lessons', () => ({ lessons: [{ id: 'a' }, { id: 'b' }] }));
vi.mock('../data/questionBank', () => ({ getQuestionsForLessons: getQuestionsForLessonsMock }));

const TODAY = '2026-06-27';
const mockedUseAuth = vi.mocked(useAuth);

function setProgress(overrides: Partial<LessonProgress>) {
  const progress: LessonProgress = {
    completedLessonIds: [],
    dailyCompletionDates: [],
    requiredPracticePassedDates: [],
    totalXp: 0,
    ...overrides,
  };
  useLessonProgressMock.mockReturnValue({ progress, testTodayKey: TODAY });
}

function renderGate() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<DailyGateRoute />}>
          <Route path="/dashboard" element={<div>Dashboard child</div>} />
        </Route>
        <Route path="/practice" element={<div>Required practice</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedUseAuth.mockReturnValue({ user: { uid: 'u1' } } as ReturnType<typeof useAuth>);
  // By default each completed lesson contributes a question to the pool.
  getQuestionsForLessonsMock.mockImplementation((ids: Iterable<string>) =>
    Array.from(ids).map((id) => ({ id })),
  );
});

describe('DailyGateRoute', () => {
  it('redirects to /practice when the daily gate is active', () => {
    setProgress({ completedLessonIds: ['a'], requiredPracticePassedDates: [] });

    renderGate();

    expect(screen.getByText('Required practice')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard child')).not.toBeInTheDocument();
  });

  it('renders the child once today\u2019s practice is passed', () => {
    setProgress({ completedLessonIds: ['a'], requiredPracticePassedDates: [TODAY] });

    renderGate();

    expect(screen.getByText('Dashboard child')).toBeInTheDocument();
  });

  it('does not gate a brand-new learner with no completed lessons', () => {
    setProgress({ completedLessonIds: [] });

    renderGate();

    expect(screen.getByText('Dashboard child')).toBeInTheDocument();
  });

  it('does not gate when the completed lessons have no practice questions', () => {
    setProgress({ completedLessonIds: ['a'], requiredPracticePassedDates: [] });
    getQuestionsForLessonsMock.mockReturnValue([]); // an unpassable gate would loop — so allow through

    renderGate();

    expect(screen.getByText('Dashboard child')).toBeInTheDocument();
  });

  it('does not gate (no loop) when a completed lesson is absent from the live course', () => {
    /* 'ghost' isn't in the mocked course, but still maps to a bank question. The OLD
     * raw-id check would gate, while PracticePage would show "complete a lesson" →
     * infinite /practice loop. The fail-safe intersects with the course, so no gate. */
    setProgress({ completedLessonIds: ['ghost'], requiredPracticePassedDates: [] });

    renderGate();

    expect(screen.getByText('Dashboard child')).toBeInTheDocument();
    expect(screen.queryByText('Required practice')).not.toBeInTheDocument();
  });

  it('degrades to ungated when evaluating the gate throws', () => {
    setProgress({ completedLessonIds: ['a'], requiredPracticePassedDates: [] });
    getQuestionsForLessonsMock.mockImplementation(() => {
      throw new Error('boom');
    });

    renderGate();

    // A thrown error must open the app, never wall it off behind a redirect.
    expect(screen.getByText('Dashboard child')).toBeInTheDocument();
  });
});
