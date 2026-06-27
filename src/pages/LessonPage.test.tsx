import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import {
  getTodayKey,
  lessonProgressStorageKey,
  questionCompletionXp,
} from '../lessons/lessonProgress';
import { LessonPage } from './LessonPage';

// Inline fixture course so these tests are independent of the authored content
// (other agents fill it in and it may be empty). Two interactive lessons in one
// chapter give us linear unlocking plus a completion → next-lesson flow.
const { mockLessons } = vi.hoisted(() => {
  type Step = Record<string, unknown>;
  function conceptStep(id: string, title: string, body: string): Step {
    return { id, type: 'concept', title, body };
  }
  function questionStep(
    id: string,
    title: string,
    choices: { id: string; label: string }[],
    correctOptionId: string,
    extras: Record<string, unknown> = {},
  ): Step {
    return {
      id,
      type: 'multiple-choice',
      title,
      prompt: `${title} prompt`,
      options: choices,
      correctOptionId,
      correctExplanation: 'Correct explanation.',
      incorrectExplanation: 'Not quite. Try again.',
      ...extras,
    };
  }

  const whatChanges = {
    id: 'what-changes',
    chapterId: 'functions-and-graphs',
    title: 'What Changes?',
    description: 'A sample lesson.',
    status: 'available',
    estimatedMinutes: 5,
    steps: [
      conceptStep('wc-c0', 'Functions describe change', 'Inputs map to outputs.'),
      questionStep(
        'table-change',
        'Spot the change',
        [
          { id: 'one', label: 'By $1$' },
          { id: 'four', label: 'By $4$' },
        ],
        'four',
        { hint: 'Look only at the two outputs.' },
      ),
      questionStep(
        'wc-q2',
        'Second question',
        [
          { id: 'a', label: '$a$' },
          { id: 'b', label: '$b$' },
        ],
        'b',
      ),
    ],
  };

  const slopeRefresher = {
    id: 'slope-refresher',
    chapterId: 'functions-and-graphs',
    title: 'Slope Refresher',
    description: 'Another sample lesson.',
    status: 'available',
    estimatedMinutes: 4,
    steps: [
      conceptStep('sr-c0', 'Slope measures steepness', 'Slope is rise over run.'),
      questionStep(
        'sr-q1',
        'Pick the slope',
        [
          { id: 'low', label: '$1$' },
          { id: 'high', label: '$2$' },
        ],
        'high',
      ),
    ],
  };

  return { mockLessons: [whatChanges, slopeRefresher] };
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

// LessonPage renders LessonPlayer, which calls useSound(); stub it so the page
// renders without a real SoundProvider (audio is a no-op in jsdom).
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

const mockedUseAuth = vi.mocked(useAuth);

function authValue(): ReturnType<typeof useAuth> {
  return {
    user: null,
    loading: false,
    isConfigured: true,
    loginWithGoogle: vi.fn(),
    loginWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    logout: vi.fn(),
    updateDisplayName: vi.fn(),
    deleteAccount: vi.fn(),
  };
}

function renderLessonPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/lessons/:lessonId" element={<LessonPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function getRadioByValue(value: string) {
  const radio = document.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`);

  if (!radio) {
    throw new Error(`Could not find radio option with value "${value}"`);
  }

  return radio;
}

async function completeWhatChangesLesson(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(getRadioByValue('four'));
  await user.click(screen.getByRole('button', { name: 'Submit answer' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(getRadioByValue('b'));
  await user.click(screen.getByRole('button', { name: 'Submit answer' }));
  await user.click(screen.getByRole('button', { name: 'Finish lesson' }));
}

describe('LessonPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockedUseAuth.mockReturnValue(authValue());
  });

  it('renders the interactive player for an available lesson', () => {
    renderLessonPage('/lessons/what-changes');

    expect(screen.getByRole('heading', { name: 'What Changes?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Functions describe change' })).toBeInTheDocument();
    expect(screen.getByLabelText('What Changes? - lesson progress')).toHaveTextContent(
      'Step 1 of 3',
    );
  });

  it('locks future interactive lessons until earlier lessons are complete', () => {
    renderLessonPage('/lessons/slope-refresher');

    expect(screen.getByRole('heading', { name: 'Slope Refresher' })).toBeInTheDocument();
    expect(screen.getByText('Complete Lesson 1 first.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('unlocks the next lesson after the previous lesson is complete', () => {
    window.localStorage.setItem(lessonProgressStorageKey, JSON.stringify(['what-changes']));

    renderLessonPage('/lessons/slope-refresher');

    expect(screen.getByRole('heading', { name: 'Slope Refresher' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Slope measures steepness' })).toBeInTheDocument();
  });

  it('keeps the next lesson unlocked after completion', async () => {
    const user = userEvent.setup();
    renderLessonPage('/lessons/what-changes');

    await completeWhatChangesLesson(user);

    expect(screen.getByRole('heading', { name: 'Nice work on What Changes?' })).toBeInTheDocument();
    await waitFor(() => {
      const storedProgress = JSON.parse(
        window.localStorage.getItem(lessonProgressStorageKey) ?? '{}',
      );

      expect(storedProgress.completedLessonIds).toContain('what-changes');
      expect(storedProgress.lessonResumeStates?.['what-changes']).toBeUndefined();
    });

    await user.click(screen.getByRole('link', { name: 'Next lesson: Slope Refresher' }));

    expect(screen.queryByText('Complete Lesson 1 first.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Slope Refresher' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Slope measures steepness' })).toBeInTheDocument();
  });

  it('restores saved partial progress for a lesson', () => {
    window.localStorage.setItem(
      lessonProgressStorageKey,
      JSON.stringify({
        completedLessonIds: [],
        dailyCompletionDates: [],
        lessonResumeStates: {
          'what-changes': {
            questionStates: {
              'table-change': {
                answerResult: 'correct',
                selectedOptionId: 'four',
                showHint: true,
              },
            },
            stepIndex: 1,
          },
        },
        totalXp: 0,
      }),
    );

    renderLessonPage('/lessons/what-changes');

    expect(screen.getByRole('heading', { name: 'Spot the change' })).toBeInTheDocument();
    expect(screen.getByLabelText('What Changes? - lesson progress')).toHaveTextContent(
      'Step 2 of 3',
    );
    expect(document.querySelector('input[type="radio"][value="four"]')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('saves partial progress to local storage while a lesson is in progress', async () => {
    const user = userEvent.setup();
    renderLessonPage('/lessons/what-changes');

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      const storedProgress = JSON.parse(
        window.localStorage.getItem(lessonProgressStorageKey) ?? '{}',
      );

      expect(storedProgress.lessonResumeStates['what-changes']).toMatchObject({
        questionStates: {},
        stepIndex: 1,
      });
    });
  });

  it('records study minutes after active lesson time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T12:00:00'));

    try {
      const { unmount } = renderLessonPage('/lessons/what-changes');

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      vi.advanceTimersByTime(125_000);
      unmount();

      const storedProgress = JSON.parse(
        window.localStorage.getItem(lessonProgressStorageKey) ?? '{}',
      );
      expect(storedProgress.dailyStudyMinutes[getTodayKey()]).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('awards XP immediately when a question is answered correctly', async () => {
    const user = userEvent.setup();
    renderLessonPage('/lessons/what-changes');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(document.querySelector('input[type="radio"][value="four"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    await waitFor(() => {
      const storedProgress = JSON.parse(
        window.localStorage.getItem(lessonProgressStorageKey) ?? '{}',
      );

      expect(storedProgress.totalXp).toBe(questionCompletionXp);
      expect(storedProgress.awardedQuestionIds['what-changes']).toEqual(['table-change']);
    });
  });

  it('shows a not found state for unknown lessons', () => {
    renderLessonPage('/lessons/not-real');

    expect(
      screen.getByRole('heading', { name: 'We could not find that lesson.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });
});
