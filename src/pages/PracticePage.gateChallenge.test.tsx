import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { createSeededRng } from '../data/questionBank';
import { getTodayKey, lessonProgressStorageKey } from '../lessons/lessonProgress';
import {
  PRACTICE_SESSION_VERSION,
  writeLocalPracticeSession,
  type PracticeSessionSnapshot,
} from '../lessons/practiceSession';
import type { ChallengeQuestionsResponse } from '../lib/ai';
import { PracticePage } from './PracticePage';

/*
 * DAILY-REQUIRED gate WITH the AI challenge round ON. AI is mocked ON, returning `count`
 * deterministic questions, so we assert the gate runs a round of ~a QUARTER of the static
 * set, that a SMALL required set still runs a round (never 0), and that a stale restored
 * count is re-derived rather than dropping the round.
 */

const { mockLessons, mockQuestions } = vi.hoisted(() => {
  function lesson(id: string, title: string) {
    return {
      id,
      chapterId: 'limits',
      title,
      description: `${title} description`,
      status: 'available',
      estimatedMinutes: 5,
      steps: [],
    };
  }

  function question(id: string, lessonId: string) {
    return {
      id,
      chapterId: 'limits',
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
    mockLessons: [lesson('big-lesson', 'Big Lesson'), lesson('tiny-lesson', 'Tiny Lesson')],
    mockQuestions: [
      ...Array.from({ length: 10 }, (_unused, index) => question(`big-${index}`, 'big-lesson')),
      question('tiny-0', 'tiny-lesson'),
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
      return lessonIdSet.size === 0
        ? []
        : source.filter(
            (question) => question.lessonId != null && lessonIdSet.has(question.lessonId),
          );
    },
  };
});

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }));

/* Pin gate ENFORCEMENT on so PracticePage runs in gate mode here. */
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

/* AI challenge round ON; the generator returns `count` deterministic questions. */
const { isAiTutorEnabledMock, generateChallengeQuestionsMock } = vi.hoisted(() => ({
  isAiTutorEnabledMock: vi.fn(() => true),
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

/* Returns exactly `count` AI questions with stable, findable prompts. */
function aiQuestions(count: number): ChallengeQuestionsResponse {
  return {
    questions: Array.from({ length: count }, (_unused, index) => ({
      id: `ai-${index + 1}`,
      prompt: `AI challenge question ${index + 1}`,
      choices: [
        { id: 'a', label: 'Right' },
        { id: 'b', label: 'Wrong' },
      ],
      correctChoiceId: 'a',
      explanation: 'A is correct.',
      targetConcept: 'sample concept',
    })),
  };
}

/** A completed, NOT-SR-due lesson (anchored today) with the gate UNPASSED → gate active. */
function setGateProgress(...completedLessonIds: string[]) {
  const today = getTodayKey(0);
  const [ty, tm, td] = today.split('-').map(Number);
  const completedAtIso = new Date(ty, tm - 1, td, 12, 0, 0, 0).toISOString();
  window.localStorage.setItem(
    lessonProgressStorageKey,
    JSON.stringify({
      completedLessonIds,
      lessonCompletedAt: Object.fromEntries(
        completedLessonIds.map((id) => [id, completedAtIso]),
      ),
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

function summaryStat(label: string): string {
  const term = screen.getByText(label, { selector: 'dt' });
  return term.parentElement?.querySelector('dd')?.textContent ?? '';
}

beforeEach(() => {
  window.localStorage.clear();
  playEffectMock.mockClear();
  isAiTutorEnabledMock.mockReturnValue(true);
  generateChallengeQuestionsMock.mockReset();
  generateChallengeQuestionsMock.mockImplementation((input: { count: number }) =>
    Promise.resolve(aiQuestions(input.count)),
  );
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

describe('PracticePage daily gate — AI challenge round', () => {
  it('runs the AI challenge round after the required set (~a quarter of the static count, double XP)', async () => {
    const user = userEvent.setup();
    setGateProgress('big-lesson'); // 10 eligible → static set of 10, AI round of ceil(10/4) = 3.
    renderGatePractice();

    // Continuous counter spans the static set (10) + the planned AI round (3) = 13.
    expect(await screen.findByLabelText('Practice progress')).toHaveTextContent('Question 1 of 13');

    // Work the 10 static questions; the last button is "Continue" (a round will run).
    for (let index = 1; index <= 10; index += 1) {
      expect(screen.getByLabelText('Practice progress')).toHaveTextContent(`Question ${index} of 13`);
      await answer(user, 'a');
      await user.click(
        screen.getByRole('button', { name: index < 10 ? 'Next' : 'Continue' }),
      );
    }

    // The AI challenge round runs: a continuous 11..13 of 13, each AI-generated.
    for (let position = 11; position <= 13; position += 1) {
      await screen.findByRole('radiogroup');
      expect(screen.getByText('Adaptive AI Challenge')).toBeInTheDocument();
      expect(screen.getByLabelText('Practice progress')).toHaveTextContent(`Question ${position} of 13`);
      await answer(user, 'a');
      await user.click(
        screen.getByRole('button', {
          name: position < 13 ? 'Next challenge question' : 'View summary',
        }),
      );
    }

    // The gate passes (100%), and the 3 AI answers folded in at DOUBLE XP: 10×10 + 3×20 = 160.
    expect(screen.getByRole('heading', { name: /Daily practice complete/ })).toBeInTheDocument();
    expect(summaryStat('Answered')).toBe('13');
    expect(summaryStat('XP earned')).toBe('160');

    // The gate requested ~a quarter (3) — never the free-practice default of 5.
    const counts = generateChallengeQuestionsMock.mock.calls.map(
      (call) => (call[0] as { count: number }).count,
    );
    expect(counts).toContain(3);
    expect(counts).not.toContain(5);
  });

  it('still runs the AI challenge round for a SMALL required set (minimum, never zero)', async () => {
    const user = userEvent.setup();
    // One eligible question → a static set of 1. ceil(1/4) floored at the minimum keeps
    // a real round, so the counter spans 1 static + 2 AI = 3.
    setGateProgress('tiny-lesson');
    renderGatePractice();

    expect(await screen.findByLabelText('Practice progress')).toHaveTextContent('Question 1 of 3');

    // Finishing the lone static question enters the AI round (not straight to the summary).
    await answer(user, 'a');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    for (let position = 2; position <= 3; position += 1) {
      await screen.findByRole('radiogroup');
      expect(screen.getByText('Adaptive AI Challenge')).toBeInTheDocument();
      expect(screen.getByLabelText('Practice progress')).toHaveTextContent(`Question ${position} of 3`);
      await answer(user, 'a');
      await user.click(
        screen.getByRole('button', {
          name: position < 3 ? 'Next challenge question' : 'View summary',
        }),
      );
    }

    expect(screen.getByRole('heading', { name: /Daily practice complete/ })).toBeInTheDocument();
  });

  it('re-derives the AI round when a restored gate snapshot carries a stale 0 count', async () => {
    const user = userEvent.setup();
    setGateProgress('big-lesson'); // gate active, 10 eligible

    // A session persisted with recommendedAiCount 0 (e.g. saved before the count was
    // wired, or a fail-safe build), resumed at the LAST static question.
    const bankQuestions = Array.from({ length: 4 }, (_unused, index) => ({
      id: `snap-${index}`,
      chapterId: 'limits',
      lessonId: 'big-lesson',
      category: 'sample',
      prompt: `Snapshot question ${index}`,
      choices: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      correctChoiceId: 'a',
      explanation: 'Because A.',
    }));
    const snapshot: PracticeSessionSnapshot = {
      version: PRACTICE_SESSION_VERSION,
      sessionId: 'stale-session-1',
      mode: 'gate',
      bankQuestions,
      questionIndex: 3,
      currentSelectedChoiceId: '',
      currentAnswerResult: null,
      correctCount: 3,
      incorrectCount: 0,
      sessionResponses: bankQuestions.slice(0, 3).map((question) => ({
        prompt: question.prompt,
        choices: question.choices,
        correctChoiceId: 'a',
        userChoiceId: 'a',
        isCorrect: true,
        category: 'sample',
      })),
      challengePhase: 'inactive',
      challengeQuestions: [],
      challengeIndex: 0,
      challengeCorrectCount: 0,
      challengeIncorrectCount: 0,
      challengeTargetCount: 0,
      challengeUnavailable: false,
      srTopicsServed: [],
      recommendedAiCount: 0, // stale/missing → must be re-derived from the static set
    };
    writeLocalPracticeSession('tester', snapshot);

    renderGatePractice();

    // Re-derived from the 4-question static set → ceil(4/4) floored at 2 = 2 AI slots,
    // so the continuous counter is 4 + 2 = 6 (NOT 4, which a dropped round would show).
    expect(await screen.findByLabelText('Practice progress')).toHaveTextContent('Question 4 of 6');

    await answer(user, 'a');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // The challenge round runs instead of jumping to the summary.
    await screen.findByRole('radiogroup');
    expect(screen.getByText('Adaptive AI Challenge')).toBeInTheDocument();
    expect(screen.getByText(/AI challenge question 1/)).toBeInTheDocument();
  });
});
