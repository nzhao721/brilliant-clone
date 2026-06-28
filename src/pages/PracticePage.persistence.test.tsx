import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { createSeededRng } from '../data/questionBank';
import { getTodayKey, lessonProgressStorageKey } from '../lessons/lessonProgress';
import { practiceSessionStorageKey } from '../lessons/practiceSession';
import type { ChallengeQuestionsResponse } from '../lib/ai';
import { PracticePage } from './PracticePage';

/*
 * Feature: resumable practice sessions. Firebase is disabled in the test runner
 * (db === null), so persistence falls back to the localStorage MIRROR — which is
 * exactly what we exercise: unmount (leave) then re-render (return) and assert the
 * SAME session resumes, that resuming NEVER re-awards XP, that the AI challenge
 * questions are restored VERBATIM without re-calling the generator, and that
 * finishing clears the saved session.
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
    mockLessons: [
      lesson('what-changes', 'limits', 'What Changes?'),
      lesson('slope-refresher', 'limits', 'Slope Refresher'),
    ],
    mockQuestions: [
      question('fg-1', 'limits', 'what-changes'),
      question('fg-2', 'limits', 'what-changes'),
      question('fg-3', 'limits', 'slope-refresher'),
      question('fg-4', 'limits', 'slope-refresher'),
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

vi.mock('../data/questionBank', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/questionBank')>();
  return {
    ...actual,
    questionBank: mockQuestions,
    getQuestionsForLessons: (lessonIds: Iterable<string>, source = mockQuestions) => {
      const lessonIdSet = new Set(lessonIds);
      if (lessonIdSet.size === 0) {
        return [];
      }
      return source.filter(
        (question) => question.lessonId != null && lessonIdSet.has(question.lessonId),
      );
    },
  };
});

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }));

vi.mock('../lessons/useAiTutor', () => ({
  useAiTutor: vi.fn(() => ({
    loading: false,
    result: null,
    error: false,
    active: false,
    requestHint: vi.fn(),
  })),
}));

const { isAiTutorEnabledMock, generateChallengeQuestionsMock } = vi.hoisted(() => ({
  isAiTutorEnabledMock: vi.fn(() => false),
  generateChallengeQuestionsMock: vi.fn(),
}));

vi.mock('../lib/ai', () => ({
  isAiTutorEnabled: isAiTutorEnabledMock,
  generateChallengeQuestions: generateChallengeQuestionsMock,
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

function setUser(uid: string | null) {
  mockedUseAuth.mockReturnValue({
    user: uid ? ({ uid } as ReturnType<typeof useAuth>['user']) : null,
    loading: false,
    isConfigured: true,
    loginWithGoogle: vi.fn(),
    loginWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    logout: vi.fn(),
    updateDisplayName: vi.fn(),
    deleteAccount: vi.fn(),
  } as ReturnType<typeof useAuth>);
}

/* Opt OUT of gate mode (pass today's required practice) so these exercise free practice. */
function completeLessons(...lessonIds: string[]) {
  window.localStorage.setItem(
    lessonProgressStorageKey,
    JSON.stringify({
      completedLessonIds: lessonIds,
      dailyCompletionDates: [],
      requiredPracticePassedDates: [getTodayKey()],
      totalXp: 0,
    }),
  );
}

function renderPractice({ sessionSize = 3, challengeCount = 0 } = {}) {
  return render(
    <MemoryRouter>
      <PracticePage rng={createSeededRng(7)} sessionSize={sessionSize} challengeCount={challengeCount} />
    </MemoryRouter>,
  );
}

async function answerVisible(user: ReturnType<typeof userEvent.setup>, value: 'a' | 'b') {
  const radio = document.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`);
  await user.click(radio as HTMLInputElement);
  await user.click(screen.getByRole('button', { name: 'Submit' }));
}

function storedXp(): number {
  return JSON.parse(window.localStorage.getItem(lessonProgressStorageKey) ?? '{}').totalXp ?? 0;
}

beforeEach(() => {
  window.localStorage.clear();
  playEffectMock.mockClear();
  isAiTutorEnabledMock.mockReturnValue(false);
  generateChallengeQuestionsMock.mockReset();
  delete (window.navigator as { onLine?: boolean }).onLine;
  setUser('tester');
});

describe('PracticePage session persistence', () => {
  it('resumes the SAME bank session after leaving, without re-awarding XP', async () => {
    const user = userEvent.setup();
    completeLessons('what-changes', 'slope-refresher');
    const first = renderPractice({ sessionSize: 3, challengeCount: 0 });

    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 1 of 3');
    await answerVisible(user, 'a');
    await user.click(screen.getByRole('button', { name: 'Next random question' }));
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 2 of 3');

    const xpAfterFirstAnswer = storedXp();
    expect(xpAfterFirstAnswer).toBeGreaterThan(0);

    // Leave the practice (navigate away / close tab).
    first.unmount();

    // Return: a fresh mount restores the in-progress session from the mirror.
    renderPractice({ sessionSize: 3, challengeCount: 0 });

    expect(await screen.findByLabelText('Practice progress')).toHaveTextContent('Question 2 of 3');
    // Resuming restored state only — it must NOT replay the Q1 award.
    expect(storedXp()).toBe(xpAfterFirstAnswer);
  });

  it('clears the saved session once the practice is completed', async () => {
    const user = userEvent.setup();
    completeLessons('what-changes');
    renderPractice({ sessionSize: 2, challengeCount: 0 });

    for (let index = 0; index < 2; index += 1) {
      await answerVisible(user, 'a');
      await user.click(
        screen.getByRole('button', { name: index < 1 ? 'Next random question' : 'View summary' }),
      );
    }

    expect(screen.getByRole('heading', { name: 'Practice summary' })).toBeInTheDocument();
    // A finished session is cleared so the learner never resumes a stale run.
    expect(window.localStorage.getItem(practiceSessionStorageKey)).toBeNull();
  });

  it('does not persist a session for a signed-out visitor', async () => {
    const user = userEvent.setup();
    setUser(null);
    completeLessons('what-changes', 'slope-refresher');
    renderPractice({ sessionSize: 3, challengeCount: 0 });

    await answerVisible(user, 'a');
    await user.click(screen.getByRole('button', { name: 'Next random question' }));

    expect(window.localStorage.getItem(practiceSessionStorageKey)).toBeNull();
  });
});

const FAST_Q1: ChallengeQuestionsResponse = {
  questions: [
    {
      id: 'q1',
      prompt: 'Fast first challenge question.',
      choices: [
        { id: 'a', label: 'Right' },
        { id: 'b', label: 'Wrong' },
        { id: 'c', label: 'Also wrong' },
      ],
      correctChoiceId: 'a',
      explanation: 'A is correct.',
      targetConcept: 'sample concept',
    },
  ],
};

const BATCH: ChallengeQuestionsResponse = {
  questions: [
    {
      id: 'b1',
      prompt: 'Batch challenge question A.',
      choices: [
        { id: 'a', label: 'Right' },
        { id: 'b', label: 'Wrong' },
        { id: 'c', label: 'Also wrong' },
      ],
      correctChoiceId: 'a',
      explanation: 'A is correct.',
      targetConcept: 'sample concept',
    },
    {
      id: 'b2',
      prompt: 'Batch challenge question B.',
      choices: [
        { id: 'a', label: 'Right' },
        { id: 'b', label: 'Wrong' },
        { id: 'c', label: 'Also wrong' },
      ],
      correctChoiceId: 'a',
      explanation: 'A is correct.',
      targetConcept: 'sample concept',
    },
  ],
};

describe('PracticePage session persistence — AI challenge round', () => {
  it('restores the AI-generated challenge questions verbatim without regenerating them', async () => {
    const user = userEvent.setup();
    isAiTutorEnabledMock.mockReturnValue(true);
    generateChallengeQuestionsMock.mockImplementation((input: { count: number }) =>
      Promise.resolve(input.count === 1 ? FAST_Q1 : BATCH),
    );

    completeLessons('what-changes', 'slope-refresher');
    const first = renderPractice({ sessionSize: 1, challengeCount: 2 });

    // Finish the single bank question → enter the AI challenge round.
    await answerVisible(user, 'a');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Fast first challenge question.')).toBeInTheDocument();

    const callsBeforeLeaving = generateChallengeQuestionsMock.mock.calls.length;
    expect(callsBeforeLeaving).toBeGreaterThan(0);

    // Leave mid-challenge, then return.
    first.unmount();
    renderPractice({ sessionSize: 1, challengeCount: 2 });

    // The SAME first challenge question is restored verbatim...
    expect(await screen.findByText('Fast first challenge question.')).toBeInTheDocument();
    // ...and the expensive generator was NOT called again on resume.
    expect(generateChallengeQuestionsMock.mock.calls.length).toBe(callsBeforeLeaving);

    // The rest of the saved round is intact too: advancing shows the next AI question.
    await answerVisible(user, 'a');
    await user.click(screen.getByRole('button', { name: 'Next challenge question' }));
    expect(await screen.findByText('Batch challenge question A.')).toBeInTheDocument();
    expect(generateChallengeQuestionsMock.mock.calls.length).toBe(callsBeforeLeaving);
  });
});
