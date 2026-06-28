import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { createSeededRng } from '../data/questionBank';
import { getTodayKey, lessonProgressStorageKey } from '../lessons/lessonProgress';
import { PracticePage } from './PracticePage';

/*
 * FAIL-SAFE: if the curated required-set build throws, the gate page must NOT crash
 * (there is no error boundary — a blank /practice would strand the gated learner).
 * It must fall back to a plain session that is still completable, and a >= 85% pass
 * must still record the daily pass so the gate clears.
 */

const { mockLessons, mockQuestions } = vi.hoisted(() => {
  function question(id: string) {
    return {
      id,
      chapterId: 'limits',
      lessonId: 'lesson-a',
      category: 'sample',
      prompt: `Prompt ${id}: $x$`,
      choices: [
        { id: 'a', label: 'Choice A' },
        { id: 'b', label: 'Choice B' },
      ],
      correctChoiceId: 'a',
      explanation: 'A is correct.',
    };
  }

  return {
    mockLessons: [
      {
        id: 'lesson-a',
        chapterId: 'limits',
        title: 'Lesson A',
        description: 'desc',
        status: 'available',
        estimatedMinutes: 5,
        steps: [],
      },
    ],
    mockQuestions: Array.from({ length: 4 }, (_unused, index) => question(`qa-${index}`)),
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

/* The curated build blows up — the page must degrade, not crash. */
vi.mock('../lessons/practiceSelection', () => ({
  buildRequiredPracticeSet: vi.fn(() => {
    throw new Error('required-set build failed');
  }),
  recommendedAiCountForStaticCount: vi.fn((count: number) =>
    count <= 0 ? 0 : Math.max(2, Math.ceil(count / 4)),
  ),
}));

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }));

/* Pin the gate ENFORCEMENT flag ON so the gate fail-safe path runs here,
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

beforeEach(() => {
  window.localStorage.clear();
  playEffectMock.mockClear();
  delete (window.navigator as { onLine?: boolean }).onLine;
  mockedUseAuth.mockReturnValue({
    user: { uid: 'tester' } as ReturnType<typeof useAuth>['user'],
  } as ReturnType<typeof useAuth>);
});

describe('PracticePage gate fail-safe (build throws)', () => {
  it('renders a passable session instead of crashing, and a pass still clears the gate', async () => {
    const user = userEvent.setup();
    setGatedProgress();
    render(
      <MemoryRouter>
        <PracticePage rng={createSeededRng(7)} />
      </MemoryRouter>,
    );

    // Did not blank/crash: a question is shown (random fallback from the same pool).
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 1 of 4');

    // Completing the fallback set at 100% still records today's pass (gate clears).
    for (let index = 0; index < 4; index += 1) {
      await user.click(document.querySelector('input[type="radio"][value="a"]') as HTMLElement);
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      await user.click(
        screen.getByRole('button', { name: index < 3 ? 'Next' : 'View summary' }),
      );
    }

    const stored = JSON.parse(window.localStorage.getItem(lessonProgressStorageKey) ?? '{}');
    expect(stored.requiredPracticePassedDates).toContain(getTodayKey(0));
  });
});
