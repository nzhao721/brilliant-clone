import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { AppLayout } from '../components/AppLayout';
import { LessonPage } from './LessonPage';

// One available, single-question lesson so a correct answer + finish earns coins
// through the REAL award path (LessonPlayer -> LessonPage onCorrectAnswer/onComplete
// -> useLessonProgress mutators), not by poking a hook mutator directly.
const { mockLessons } = vi.hoisted(() => ({
  mockLessons: [
    {
      id: 'earn-lesson',
      chapterId: 'functions-and-graphs',
      title: 'Earn Lesson',
      description: 'A sample lesson.',
      status: 'available',
      estimatedMinutes: 5,
      steps: [
        {
          id: 'earn-q0',
          type: 'multiple-choice',
          title: 'Pick the right answer',
          prompt: 'Pick the right answer',
          options: [
            { id: 'right', label: 'Right' },
            { id: 'wrong', label: 'Wrong' },
          ],
          correctOptionId: 'right',
          correctExplanation: 'Yes.',
          incorrectExplanation: 'No.',
        },
      ],
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

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }));

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

// AppLayout imports resetGameHighScores from the games registry; stub it so the
// header renders without pulling in the per-game components/audio.
vi.mock('../games', () => ({ resetGameHighScores: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);

function signIn() {
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
}

// The header HUD coin number, read straight off the long-lived element.
function headerCoins(): string {
  return (document.querySelector('.hs-coin .hs-chip-value') as HTMLElement).textContent ?? '';
}

function renderHeaderWithLesson(strict = false) {
  const tree = (
    <MemoryRouter initialEntries={['/lessons/earn-lesson']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/lessons/:lessonId" element={<LessonPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
  // The real app mounts inside <React.StrictMode>, which double-invokes effects
  // (mount → cleanup → mount); exercise that path too so a broken/leaky
  // subscription can't slip through.
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

async function earnCoinsAndAssertHeaderLive(user: ReturnType<typeof userEvent.setup>) {
  expect(headerCoins()).toBe('0');
  const headerChip = document.querySelector('.hs-coin .hs-chip-value') as HTMLElement;

  // Answer correctly: awards per-question coins via the real award path.
  await user.click(document.querySelector('input[type="radio"][value="right"]') as HTMLElement);
  await user.click(screen.getByRole('button', { name: 'Submit answer' }));

  // The SAME header element (no remount) reflects the freshly-earned coins.
  await waitFor(() => expect(headerCoins()).toBe('5'));
  expect(document.querySelector('.hs-coin .hs-chip-value')).toBe(headerChip);

  // Finishing the lesson adds the completion bonus; header stays live.
  await user.click(screen.getByRole('button', { name: 'Finish lesson' }));

  await waitFor(() => expect(headerCoins()).toBe('20'));
  expect(document.querySelector('.hs-coin .hs-chip-value')).toBe(headerChip);
}

describe('header coin balance reacts to coins earned in a lesson (no remount)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    signIn();
  });

  it('updates the long-lived header immediately when a lesson awards coins', async () => {
    const user = userEvent.setup();
    renderHeaderWithLesson();
    await earnCoinsAndAssertHeaderLive(user);
  });

  it('stays live under React.StrictMode (effect double-invoke)', async () => {
    const user = userEvent.setup();
    renderHeaderWithLesson(true);
    await earnCoinsAndAssertHeaderLive(user);
  });
});
