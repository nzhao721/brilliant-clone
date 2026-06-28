import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { createSeededRng } from '../data/questionBank';
import { getTodayKey, lessonProgressStorageKey } from '../lessons/lessonProgress';
import type { ChallengeQuestionsResponse } from '../lib/ai';
import { PracticePage } from './PracticePage';

/* Challenge-round coverage. src/lib/ai is mocked so we control whether a round runs and what it returns
   (no network); flipped on per test. Real useLessonProgress runs so we can assert challenge answers never touch history/XP. */

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

  /* A 20-question lesson so a default 20-question round can be drawn entirely from it for the "of 25" happy path. */
  const bigSetQuestions = Array.from({ length: 20 }, (_, index) =>
    question(`big-${index + 1}`, 'limits', 'big-set'),
  );

  return {
    mockLessons: [
      lesson('what-changes', 'limits', 'What Changes?'),
      lesson('slope-refresher', 'limits', 'Slope Refresher'),
      lesson('big-set', 'limits', 'Big Set'),
    ],
    mockQuestions: [
      question('fg-1', 'limits', 'what-changes'),
      question('fg-2', 'limits', 'what-changes'),
      question('fg-3', 'limits', 'slope-refresher'),
      question('fg-4', 'limits', 'slope-refresher'),
      ...bigSetQuestions,
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

vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

/* Keep the per-question AI tutor inert (static bank feedback); challenge logic comes from the mocked src/lib/ai below. */
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

const CHALLENGE_QUESTIONS: ChallengeQuestionsResponse = {
  questions: [
    {
      id: 'c1',
      prompt: 'Challenge one: what is $\\lim_{x\\to 0} x$?',
      choices: [
        { id: 'a', label: '$0$' },
        { id: 'b', label: '$1$' },
        { id: 'c', label: '$\\infty$' },
      ],
      correctChoiceId: 'a',
      explanation: 'The limit is $0$.',
      targetConcept: 'limits at a point',
    },
    {
      id: 'c2',
      prompt: 'Challenge two: the derivative of $x^2$ is?',
      choices: [
        { id: 'a', label: '$2x$' },
        { id: 'b', label: '$x$' },
        { id: 'c', label: '$2$' },
      ],
      correctChoiceId: 'a',
      explanation: 'Power rule gives $2x$.',
      targetConcept: 'power rule',
    },
  ],
};

/* A full 5-question set (default round size); every correct choice is 'a' for single-value answering. */
const CHALLENGE_QUESTIONS_5: ChallengeQuestionsResponse = {
  questions: Array.from({ length: 5 }, (_, index) => ({
    id: `c${index + 1}`,
    prompt: `Challenge ${index + 1}: pick the right one.`,
    choices: [
      { id: 'a', label: 'Right' },
      { id: 'b', label: 'Wrong' },
      { id: 'c', label: 'Also wrong' },
    ],
    correctChoiceId: 'a',
    explanation: 'A is correct.',
    targetConcept: 'sample concept',
  })),
};

/* The fast count=1 reply supplying Q1; a distinct prompt so it dedupes against the batch. */
const FAST_Q1: ChallengeQuestionsResponse = {
  questions: [
    {
      id: 'q1',
      prompt: 'Fast first question: pick the right one.',
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

/* Mocks the two-call sourcing: count=1 → q1, count=N → batch. batch may be a promise so a test can hold it pending to prove Q1 streams first. */
function mockChallengeSourcing(
  q1: ChallengeQuestionsResponse | null,
  batch: ChallengeQuestionsResponse | null | Promise<ChallengeQuestionsResponse | null>,
) {
  generateChallengeQuestionsMock.mockImplementation(
    (input: { count: number }) =>
      input.count === 1 ? Promise.resolve(q1) : Promise.resolve(batch),
  );
}

function setUser(user: unknown) {
  mockedUseAuth.mockReturnValue({
    user,
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

/* The challenge round is part of the OPTIONAL free-practice flow, so pass today's
   daily gate (requiredPracticePassedDates includes today) to opt out of gate mode. */
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

function renderPractice({ sessionSize = 1, challengeCount = 2 } = {}) {
  return render(
    <MemoryRouter>
      <PracticePage rng={createSeededRng(7)} sessionSize={sessionSize} challengeCount={challengeCount} />
    </MemoryRouter>,
  );
}

// Answers the visible single-choice question and submits it.
async function answerVisibleQuestion(
  user: ReturnType<typeof userEvent.setup>,
  choiceValue: 'a' | 'b',
) {
  const radio = document.querySelector<HTMLInputElement>(
    `input[type="radio"][value="${choiceValue}"]`,
  );
  await user.click(radio as HTMLInputElement);
  await user.click(screen.getByRole('button', { name: 'Submit' }));
}

/* Reads a summary stat by its label (the <dt>'s sibling <dd>), e.g. summaryStat('Correct') -> '25'. */
function summaryStat(label: string): string {
  const term = screen.getByText(label, { selector: 'dt' });
  return term.parentElement?.querySelector('dd')?.textContent ?? '';
}

/* The on-screen question id from the prompt heading ("Prompt for <id>: ..."), which also identifies static fillers by bank id. */
function currentQuestionId(): string | null {
  const heading = document.querySelector('.lesson-step h2')?.textContent ?? '';
  const match = heading.match(/Prompt for ([\w-]+):/);
  return match ? match[1] : null;
}

beforeEach(() => {
  window.localStorage.clear();
  playEffectMock.mockClear();
  isAiTutorEnabledMock.mockReturnValue(true);
  generateChallengeQuestionsMock.mockReset();
  delete (window.navigator as { onLine?: boolean }).onLine;
  setUser({ uid: 'tester' });
});

describe('PracticePage challenge round', () => {
  it('shows the FIRST challenge question fast, then streams the rest behind a per-question loader', async () => {
    const user = userEvent.setup();
    /* Q1 (count=1) resolves now; the count=N batch is held pending to prove Q1 renders without it. */
    let resolveBatch!: (value: ChallengeQuestionsResponse | null) => void;
    mockChallengeSourcing(
      FAST_Q1,
      new Promise<ChallengeQuestionsResponse | null>((resolve) => {
        resolveBatch = resolve;
      }),
    );

    completeLessons('what-changes', 'slope-refresher');
    renderPractice({ sessionSize: 1, challengeCount: 3 });

    await answerVisibleQuestion(user, 'a');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    /* Q1 (position 2 of 1 + 3 = 4) appears before the batch resolves. */
    expect(await screen.findByText(/Fast first question/)).toBeInTheDocument();
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 2 of 4');

    // Advancing to Q2 while the batch is still pending shows a per-question loader.
    await answerVisibleQuestion(user, 'a');
    await user.click(screen.getByRole('button', { name: 'Next challenge question' }));
    expect(screen.getByText('Generating the next question…')).toBeInTheDocument();
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 3 of 4');

    // The batch lands → Q2 renders and the loader disappears.
    await act(async () => {
      resolveBatch({
        questions: [CHALLENGE_QUESTIONS.questions[0], CHALLENGE_QUESTIONS.questions[1]],
      });
    });
    expect(screen.queryByText('Generating the next question…')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 3 of 4');
    expect(screen.getByText(/Challenge one/)).toBeInTheDocument();

    // Two AI calls were made: the fast count=1 and the background count=3.
    const counts = generateChallengeQuestionsMock.mock.calls.map(
      (call) => (call[0] as { count: number }).count,
    );
    expect(counts).toContain(1);
    expect(counts).toContain(3);
  });

  it('counts the 20-question bank + 5-question (AI) challenge as one continuous "of 25"', async () => {
    const user = userEvent.setup();
    /* The 20-question bank uses the whole pool (none unused), so the round is all AI: fast Q1 + the batch. */
    mockChallengeSourcing(FAST_Q1, CHALLENGE_QUESTIONS_5);

    completeLessons('big-set');
    render(
      <MemoryRouter>
        <PracticePage rng={createSeededRng(7)} />
      </MemoryRouter>,
    );

    // Regular round: 20 questions, counter reads "of 25" from the very first one.
    for (let position = 1; position <= 20; position += 1) {
      expect(screen.getByLabelText('Practice progress')).toHaveTextContent(
        `Question ${position} of 25`,
      );
      fireEvent.click(document.querySelector('input[type="radio"][value="a"]') as HTMLElement);
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
      fireEvent.click(
        screen.getByRole('button', { name: position < 20 ? 'Next random question' : 'Continue' }),
      );
    }

    // Challenge round: continuous 21..25 of 25, every slot an AI question.
    for (let position = 21; position <= 25; position += 1) {
      await screen.findByRole('radiogroup');
      expect(screen.getByLabelText('Practice progress')).toHaveTextContent(
        `Question ${position} of 25`,
      );
      await answerVisibleQuestion(user, 'a');
      await user.click(
        screen.getByRole('button', {
          name: position < 25 ? 'Next challenge question' : 'View summary',
        }),
      );
    }

    /* The count=5 batch was prefetched at the last bank question using only the first 19 answers (the 20th is excluded). */
    const prefetchCall = generateChallengeQuestionsMock.mock.calls.find(
      (call) => (call[0] as { count: number }).count === 5,
    );
    expect(prefetchCall).toBeDefined();
    expect((prefetchCall![0] as { sessionQuestions: unknown[] }).sessionQuestions).toHaveLength(19);

    /* The summary folds all 5 challenge questions into every stat: 25 answered/correct, 100%, with double awards (20×10 + 5×20 = 300 XP, 20×5 + 5×10 = 150 coins). */
    expect(screen.getByRole('heading', { name: 'Practice summary' })).toBeInTheDocument();
    expect(
      screen.getByText(/You answered 25 questions from this mixed set with 100% correct/),
    ).toBeInTheDocument();
    expect(summaryStat('Answered')).toBe('25');
    expect(summaryStat('Correct')).toBe('25');
    expect(summaryStat('Accuracy')).toBe('100%');
    expect(summaryStat('XP earned')).toBe('300');
    expect(summaryStat('Coins earned')).toBe('150');
    expect(screen.getByText(/Includes 5 bonus challenge questions/)).toBeInTheDocument();
  });

  it('starts generation when the learner REACHES the last bank question, excluding that question', async () => {
    const user = userEvent.setup();
    mockChallengeSourcing(FAST_Q1, CHALLENGE_QUESTIONS_5);

    completeLessons('big-set'); // 20 eligible — plenty for a 3-question bank
    renderPractice({ sessionSize: 3, challengeCount: 2 });

    /* Answer the first two bank questions; the second Next lands on the 3rd (last), where generation should fire before it's answered. */
    await answerVisibleQuestion(user, 'a');
    await user.click(screen.getByRole('button', { name: 'Next random question' }));
    await answerVisibleQuestion(user, 'a');
    await user.click(screen.getByRole('button', { name: 'Next random question' }));

    /* On the last bank question (3 of 5) generation has already fired, using only the first 2 answers. */
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 3 of 5');
    expect(generateChallengeQuestionsMock).toHaveBeenCalledTimes(1);
    const prefetchArg = generateChallengeQuestionsMock.mock.calls[0][0] as {
      count: number;
      sessionQuestions: unknown[];
    };
    expect(prefetchArg.count).toBe(2);
    expect(prefetchArg.sessionQuestions).toHaveLength(2);

    /* Finishing the last bank question starts the round from the prefetched batch (counter continues "of 5"). */
    await answerVisibleQuestion(user, 'a');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('radiogroup');
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 4 of 5');
  });

  it('fills the challenge round with STATIC bank questions when the AI returns nothing', async () => {
    const user = userEvent.setup();
    generateChallengeQuestionsMock.mockResolvedValue(null); // both the fast + batch calls fail

    // Plenty of unused bank questions for static fill: 24 eligible, 2 used.
    completeLessons('big-set', 'what-changes', 'slope-refresher');
    renderPractice({ sessionSize: 2, challengeCount: 2 });

    const bankIds: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      bankIds.push(currentQuestionId() as string);
      await answerVisibleQuestion(user, 'a');
      await user.click(
        screen.getByRole('button', { name: i < 1 ? 'Next random question' : 'Continue' }),
      );
    }

    // The round STILL runs via static fill — counter "of 4", no "unavailable".
    await screen.findByRole('radiogroup');
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 3 of 4');
    expect(
      screen.queryByText('Adaptive AI Challenge unavailable this time.'),
    ).not.toBeInTheDocument();

    const challengeIds: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      await screen.findByRole('radiogroup');
      expect(screen.getByLabelText('Practice progress')).toHaveTextContent(`Question ${3 + i} of 4`);
      challengeIds.push(currentQuestionId() as string);
      await answerVisibleQuestion(user, 'a');
      await user.click(
        screen.getByRole('button', { name: i < 1 ? 'Next challenge question' : 'View summary' }),
      );
    }

    /* Fillers are real bank questions: none repeat the bank round or each other, all from the unused pool. */
    expect(challengeIds).toHaveLength(2);
    for (const id of challengeIds) {
      expect(id).toMatch(/^(big-\d+|fg-\d+)$/);
      expect(bankIds).not.toContain(id);
    }
    expect(new Set([...bankIds, ...challengeIds]).size).toBe(4);

    /* Summary folds the static challenge in (4 answered, all correct) with the same double rewards: 60 XP, 30 coins. */
    expect(screen.getByRole('heading', { name: 'Practice summary' })).toBeInTheDocument();
    expect(summaryStat('Answered')).toBe('4');
    expect(summaryStat('Correct')).toBe('4');
    expect(summaryStat('XP earned')).toBe('60');
    expect(summaryStat('Coins earned')).toBe('30');
    expect(screen.getByText(/Includes 2 bonus challenge questions/)).toBeInTheDocument();

    // Static fillers stay OUT of persistent history (only the 2 bank answers count).
    const stored = JSON.parse(window.localStorage.getItem(lessonProgressStorageKey) ?? '{}');
    expect(Object.keys(stored.questionAttempts ?? {})).toHaveLength(2);
  });

  it('builds the round entirely from STATIC bank questions when the AI is disabled (no AI call)', async () => {
    const user = userEvent.setup();
    isAiTutorEnabledMock.mockReturnValue(false);

    completeLessons('big-set', 'what-changes', 'slope-refresher');
    renderPractice({ sessionSize: 2, challengeCount: 2 });

    await answerVisibleQuestion(user, 'a');
    await user.click(screen.getByRole('button', { name: 'Next random question' }));
    await answerVisibleQuestion(user, 'a');
    // AI off, but unused bank questions exist → the round still runs ("Continue").
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // No AI call at all; the static round is ready immediately.
    expect(generateChallengeQuestionsMock).not.toHaveBeenCalled();
    await screen.findByRole('radiogroup');
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 3 of 4');

    for (let i = 0; i < 2; i += 1) {
      await screen.findByRole('radiogroup');
      await answerVisibleQuestion(user, 'a');
      await user.click(
        screen.getByRole('button', { name: i < 1 ? 'Next challenge question' : 'View summary' }),
      );
    }

    expect(screen.getByRole('heading', { name: 'Practice summary' })).toBeInTheDocument();
    expect(summaryStat('Answered')).toBe('4');
    expect(summaryStat('XP earned')).toBe('60');
    expect(summaryStat('Coins earned')).toBe('30');
  });

  it('awards DOUBLE XP and DOUBLE coins for a correct challenge answer but records no history', async () => {
    const user = userEvent.setup();
    mockChallengeSourcing(FAST_Q1, CHALLENGE_QUESTIONS);

    completeLessons('what-changes', 'slope-refresher');
    renderPractice({ sessionSize: 1, challengeCount: 2 });

    // Answer the bank question correctly (records history + the NORMAL reward).
    await answerVisibleQuestion(user, 'a');
    const afterBank = JSON.parse(window.localStorage.getItem(lessonProgressStorageKey) ?? '{}');
    expect(Object.keys(afterBank.questionAttempts ?? {})).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Answer the FIRST challenge question correctly.
    expect(await screen.findByText(/Fast first question/)).toBeInTheDocument();
    await answerVisibleQuestion(user, 'a');

    const afterCorrect = JSON.parse(window.localStorage.getItem(lessonProgressStorageKey) ?? '{}');
    // DOUBLE a normal answer (10 XP + 5 coins): +20 XP and +10 coins.
    expect(afterCorrect.totalXp - afterBank.totalXp).toBe(20);
    expect((afterCorrect.totalCoinsEarned ?? 0) - (afterBank.totalCoinsEarned ?? 0)).toBe(10);
    // ...but the challenge question is NOT recorded into history / topic-stats.
    expect(Object.keys(afterCorrect.questionAttempts ?? {})).toHaveLength(1);
    expect(afterCorrect.topicStats).toEqual(afterBank.topicStats);

    // A WRONG challenge answer earns nothing and logs no recent mistake.
    await user.click(screen.getByRole('button', { name: 'Next challenge question' }));
    await screen.findByRole('radiogroup');
    await answerVisibleQuestion(user, 'b');
    await user.click(screen.getByRole('button', { name: 'View summary' }));

    const afterWrong = JSON.parse(window.localStorage.getItem(lessonProgressStorageKey) ?? '{}');
    expect(afterWrong.totalXp).toBe(afterCorrect.totalXp);
    expect(afterWrong.totalCoinsEarned ?? 0).toBe(afterCorrect.totalCoinsEarned ?? 0);
    expect(afterWrong.recentMistakes ?? []).toHaveLength(0);

    /* Summary folds the challenge in: 3 answered, 2 correct, with double awards — 30 XP, 15 coins. */
    expect(screen.getByRole('heading', { name: 'Practice summary' })).toBeInTheDocument();
    expect(
      screen.getByText(/You answered 3 questions from this mixed set with 67% correct/),
    ).toBeInTheDocument();
    expect(summaryStat('Answered')).toBe('3');
    expect(summaryStat('Correct')).toBe('2');
    expect(summaryStat('XP earned')).toBe('30');
    expect(summaryStat('Coins earned')).toBe('15');
    expect(screen.getByText(/Includes 2 bonus challenge questions/)).toBeInTheDocument();
    expect(screen.queryByText(/You got 1 of 2 bonus questions/)).not.toBeInTheDocument();
  });

  it('degrades gracefully (unavailable) when the bank is exhausted AND the AI fails', async () => {
    const user = userEvent.setup();
    generateChallengeQuestionsMock.mockResolvedValue(null); // AI fails

    /* The session uses the entire pool (2 of 2) → no unused backfill, and the AI returns nothing → can't run. */
    completeLessons('what-changes');
    renderPractice({ sessionSize: 2, challengeCount: 2 });

    await answerVisibleQuestion(user, 'a');
    await user.click(screen.getByRole('button', { name: 'Next random question' }));
    await answerVisibleQuestion(user, 'a');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    /* Falls back to the summary with the "unavailable" note — only the 2 bank questions count (no crash/NaN). */
    expect(await screen.findByRole('heading', { name: 'Practice summary' })).toBeInTheDocument();
    expect(screen.getByText('Adaptive AI Challenge unavailable this time.')).toBeInTheDocument();
    expect(summaryStat('Answered')).toBe('2');
    expect(summaryStat('XP earned')).toBe('20');
    expect(screen.queryByText(/bonus challenge question/)).not.toBeInTheDocument();
  });

  it('does not surface a "Targets:" line in challenge feedback (targetConcept stays internal)', async () => {
    const user = userEvent.setup();
    mockChallengeSourcing(FAST_Q1, CHALLENGE_QUESTIONS);

    completeLessons('what-changes', 'slope-refresher');
    renderPractice({ sessionSize: 1, challengeCount: 2 });

    // Finish the single bank question to enter the challenge round.
    await answerVisibleQuestion(user, 'a');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Answer the first challenge question so its feedback renders.
    expect(await screen.findByText(/Fast first question/)).toBeInTheDocument();
    await answerVisibleQuestion(user, 'a');

    /* The feedback is shown, but the old "Targets: <concept>" line is gone — the
       targetConcept (FAST_Q1 uses 'sample concept') is no longer rendered. */
    expect(screen.getByText('Correct.')).toBeInTheDocument();
    expect(screen.queryByText(/Targets:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sample concept/i)).not.toBeInTheDocument();
  });
});
