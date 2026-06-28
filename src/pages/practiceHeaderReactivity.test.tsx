import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { AppLayout } from '../components/AppLayout';
import { useAiTutor } from '../lessons/useAiTutor';
import { getTodayKey, lessonProgressStorageKey } from '../lessons/lessonProgress';
import { PracticePage } from './PracticePage';

/* One completed lesson with two practice questions, so practice unlocks and a correct answer earns coins through the real path (PracticePage → awardPracticeQuestion → useLessonProgress). */
const { mockLessons, mockQuestions } = vi.hoisted(() => ({
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
  mockQuestions: [
    {
      id: 'qa1',
      chapterId: 'limits',
      lessonId: 'lesson-a',
      category: 'sample',
      prompt: 'Question A1',
      choices: [
        { id: 'a', label: 'Right' },
        { id: 'b', label: 'Wrong' },
      ],
      correctChoiceId: 'a',
      explanation: 'A is correct.',
    },
    {
      id: 'qa2',
      chapterId: 'limits',
      lessonId: 'lesson-a',
      category: 'sample',
      prompt: 'Question A2',
      choices: [
        { id: 'a', label: 'Right' },
        { id: 'b', label: 'Wrong' },
      ],
      correctChoiceId: 'a',
      explanation: 'A is correct.',
    },
  ],
}));

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
        : source.filter((question) => question.lessonId != null && lessonIdSet.has(question.lessonId));
    },
  };
});

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }));

vi.mock('../lessons/useAiTutor', () => ({ useAiTutor: vi.fn() }));

vi.mock('../audio/SoundProvider', () => ({
  useSound: () => ({
    playEffect: vi.fn(),
    playCustom: vi.fn(),
    startMusic: vi.fn(),
    stopMusic: vi.fn(),
    isMuted: false,
    toggleMute: vi.fn(),
    volume: 1,
    setVolume: vi.fn(),
  }),
}));

vi.mock('../games', () => ({ resetGameHighScores: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseAiTutor = vi.mocked(useAiTutor);

function headerCoins(): string {
  return (document.querySelector('.hs-coin .hs-chip-value') as HTMLElement).textContent ?? '';
}

beforeEach(() => {
  window.localStorage.clear();
  mockedUseAiTutor.mockReturnValue({
    loading: false,
    result: null,
    error: false,
    active: false,
    requestHint: vi.fn(),
  });
  mockedUseAuth.mockReturnValue({
    user: { uid: 'u1', displayName: 'Maya', email: 'maya@example.com' } as ReturnType<
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
  // A completed lesson unlocks practice; pass today's gate so this exercises the
  // free-practice coin path (not the daily-required gate). Start at zero coins.
  window.localStorage.setItem(
    lessonProgressStorageKey,
    JSON.stringify({
      completedLessonIds: ['lesson-a'],
      dailyCompletionDates: [],
      requiredPracticePassedDates: [getTodayKey()],
      totalXp: 0,
      totalCoinsEarned: 0,
    }),
  );
});

describe('header coin balance reacts to coins earned in practice (no remount)', () => {
  it('updates the long-lived header immediately when a practice answer earns coins', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/practice']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/practice" element={<PracticePage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    // Header is mounted up front with a zero balance.
    expect(headerCoins()).toBe('0');
    const headerChip = document.querySelector('.hs-coin .hs-chip-value') as HTMLElement;

    /* The session auto-starts (no intro); answer correctly (every fixture's correct choice is 'a'). */
    await user.click(document.querySelector('input[type="radio"][value="a"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    // The long-lived header reflects the freshly-earned coin with no remount.
    await waitFor(() => expect(headerCoins()).toBe('5'));
    expect(document.querySelector('.hs-coin .hs-chip-value')).toBe(headerChip);
  });
});
