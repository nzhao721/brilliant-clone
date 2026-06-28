import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { createSeededRng } from '../data/questionBank';
import { dateKeyToDayNumber, dayNumberToDateKey } from '../lessons/dayMath';
import { getTodayKey, lessonProgressStorageKey } from '../lessons/lessonProgress';
import { practiceSessionStorageKey } from '../lessons/practiceSession';
import { PracticePage } from './PracticePage';

/*
 * DAILY-REQUIRED gate: each ATTEMPT must serve DIFFERENT specific questions while
 * keeping the SAME weak/SR selection criteria. One completed, SR-due lesson with 12
 * questions: the criteria draw a 10-question subset, so a retry can (and must)
 * re-randomize WHICH 10 are pulled. An in-progress attempt, however, resumes with its
 * EXACT saved set (the persisted snapshot is authoritative). AI is mocked OFF so the
 * gate is the static required set only (still passable).
 */

/* The single SR-due lesson has 12 bank questions; the required set draws 10 (SR
 * coverage (1) + SR quota top-up to 10), leaving a 10-of-12 subset that a retry can
 * re-randomize. */
const GATE_SET_SIZE = 10;

const { mockLessons, mockQuestions } = vi.hoisted(() => {
  function question(id: string) {
    return {
      id,
      chapterId: 'limits',
      lessonId: 'lesson-a',
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
      {
        id: 'lesson-a',
        chapterId: 'limits',
        title: 'Lesson A',
        description: 'Lesson A description',
        status: 'available',
        estimatedMinutes: 5,
        steps: [],
      },
    ],
    mockQuestions: Array.from({ length: 12 }, (_unused, index) => question(`qa-${index}`)),
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

/* Force the AI challenge round OFF so the gate is the static required set only. */
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

/** A completed, SR-due (5 days ago) lesson with the daily gate UNPASSED → gate active.
 *  Left unattempted so the topic is purely SR-due (not weak), giving a clean 10-of-12
 *  required subset that a retry can re-randomize. */
function setGatedProgress() {
  const today = getTodayKey(0);
  const fiveDaysAgo = dayNumberToDateKey((dateKeyToDayNumber(today) as number) - 5) as string;
  const [fy, fm, fd] = fiveDaysAgo.split('-').map(Number);
  const completedAtIso = new Date(fy, fm - 1, fd, 12, 0, 0, 0).toISOString();
  window.localStorage.setItem(
    lessonProgressStorageKey,
    JSON.stringify({
      completedLessonIds: ['lesson-a'],
      lessonCompletedAt: { 'lesson-a': completedAtIso },
      dailyCompletionDates: [],
      requiredPracticePassedDates: [],
      totalXp: 0,
    }),
  );
}

/* The same stateful seeded rng instance is shared by the initial build AND the retry
   build, so the retry draws from a later point in the stream → a different shuffle. */
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

type StoredSnapshot = { sessionId: string; bankQuestions: { id: string }[] };

function storedSnapshot(): StoredSnapshot | null {
  const raw = window.localStorage.getItem(practiceSessionStorageKey);
  if (!raw) {
    return null;
  }
  return (JSON.parse(raw) as { snapshot?: StoredSnapshot }).snapshot ?? null;
}

async function readSavedSnapshot(): Promise<StoredSnapshot> {
  await waitFor(() => {
    expect(storedSnapshot()).not.toBeNull();
  });
  const snapshot = storedSnapshot();
  if (!snapshot) {
    throw new Error('expected a saved practice session snapshot');
  }
  return snapshot;
}

beforeEach(() => {
  window.localStorage.clear();
  playEffectMock.mockClear();
  isAiTutorEnabledMock.mockReturnValue(false);
  generateChallengeQuestionsMock.mockReset();
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

describe('PracticePage daily gate re-randomization', () => {
  it('serves a DIFFERENT required set on a failed-gate retry (same banks, new attempt)', async () => {
    const user = userEvent.setup();
    setGatedProgress();
    renderGatePractice();

    expect(await screen.findByLabelText('Practice progress')).toHaveTextContent(
      `Question 1 of ${GATE_SET_SIZE}`,
    );

    // The first attempt's persisted set (a 10-of-12 subset of the lesson's bank).
    const before = await readSavedSnapshot();
    expect(before.bankQuestions).toHaveLength(GATE_SET_SIZE);
    const beforeIds = before.bankQuestions.map((question) => question.id);
    expect(new Set(beforeIds).size).toBe(GATE_SET_SIZE); // no repeats

    // Complete the attempt BELOW 85% (8 correct + 2 wrong = 80%) → fail → "Try again".
    for (let index = 0; index < GATE_SET_SIZE; index += 1) {
      await answer(user, index < 8 ? 'a' : 'b');
      await user.click(
        screen.getByRole('button', {
          name: index < GATE_SET_SIZE - 1 ? 'Next random question' : 'View summary',
        }),
      );
    }
    expect(screen.getByRole('heading', { name: /Keep going/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent(
      `Question 1 of ${GATE_SET_SIZE}`,
    );

    // The retry minted a NEW attempt: a new session id and a re-randomized set drawn
    // from the SAME lesson bank (so the learner doesn't redo the identical questions).
    const after = await readSavedSnapshot();
    expect(after.bankQuestions).toHaveLength(GATE_SET_SIZE);
    const afterIds = after.bankQuestions.map((question) => question.id);
    expect(after.sessionId).not.toBe(before.sessionId);
    expect(afterIds).not.toEqual(beforeIds);
    // Same banks only: every drawn question still comes from the eligible lesson pool.
    for (const id of afterIds) {
      expect(id.startsWith('qa-')).toBe(true);
    }
    expect(new Set(afterIds).size).toBe(GATE_SET_SIZE);
  });

  it('resumes an in-progress attempt with the EXACT same set (no mid-attempt re-randomization)', async () => {
    const user = userEvent.setup();
    setGatedProgress();
    const first = renderGatePractice();

    expect(await screen.findByLabelText('Practice progress')).toHaveTextContent(
      `Question 1 of ${GATE_SET_SIZE}`,
    );

    // Advance one question so there's progress worth resuming.
    await answer(user, 'a');
    await user.click(screen.getByRole('button', { name: 'Next random question' }));
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent(
      `Question 2 of ${GATE_SET_SIZE}`,
    );

    const before = await readSavedSnapshot();
    const beforeIds = before.bankQuestions.map((question) => question.id);

    // Leave the page, then return: the saved snapshot must be restored verbatim.
    first.unmount();
    renderGatePractice();

    expect(await screen.findByLabelText('Practice progress')).toHaveTextContent(
      `Question 2 of ${GATE_SET_SIZE}`,
    );

    const after = await readSavedSnapshot();
    // Same attempt (same session id) and the SAME questions — NOT a fresh random draw.
    expect(after.sessionId).toBe(before.sessionId);
    expect(after.bankQuestions.map((question) => question.id)).toEqual(beforeIds);
  });
});
