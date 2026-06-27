import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { createSeededRng } from '../data/questionBank';
import { lessonProgressStorageKey } from '../lessons/lessonProgress';
import { useAiTutor, type UseAiTutorResult } from '../lessons/useAiTutor';
import { PracticePage } from './PracticePage';

// Real chapter list (stable foundation) with mocked lessons + questions, so the
// practice UI is exercised independently of the authored content. Practice now
// unlocks per LESSON: "What Changes?" and "Slope Refresher" each own two
// questions, "Derivative Basics" owns two, and "Behavior Intro" owns none (the
// "completed but empty pool" path).
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

  // A lesson that owns 20 questions, used to prove the regular round defaults to
  // 20 (the other lessons stay small so the existing count assertions are intact).
  const bigSetQuestions = Array.from({ length: 20 }, (_, index) =>
    question(`big-${index + 1}`, 'limits', 'big-set'),
  );

  return {
    mockLessons: [
      lesson('what-changes', 'limits', 'What Changes?'),
      lesson('slope-refresher', 'limits', 'Slope Refresher'),
      lesson('intro-limits', 'derivatives', 'Derivative Basics'),
      lesson('deriv-intro', 'behavior-of-functions', 'Behavior Intro'),
      lesson('big-set', 'limits', 'Big Set'),
    ],
    mockQuestions: [
      question('fg-1', 'limits', 'what-changes'),
      question('fg-2', 'limits', 'what-changes'),
      question('fg-3', 'limits', 'slope-refresher'),
      question('fg-4', 'limits', 'slope-refresher'),
      question('lim-1', 'derivatives', 'intro-limits'),
      question('lim-2', 'derivatives', 'intro-limits'),
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
    getPracticeQuestionsForChapter: (chapterId: string, source = mockQuestions) =>
      source.filter((question) => question.chapterId === chapterId),
    getQuestionsForChapters: (chapterIds: Iterable<string>, source = mockQuestions) => {
      const chapterIdSet = new Set(chapterIds);
      if (chapterIdSet.size === 0) {
        return [];
      }
      return source.filter((question) => chapterIdSet.has(question.chapterId));
    },
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

// Drive the card's AI gating through the hook's returned state. Default is INERT
// (active: false), matching the real hook in the test runner so the existing
// static-feedback assertions hold; AI-enabled cases override per test.
vi.mock('../lessons/useAiTutor', () => ({
  useAiTutor: vi.fn(),
}));

// Capture the answer cues without a real SoundProvider (audio no-ops in jsdom).
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
const mockedUseAiTutor = vi.mocked(useAiTutor);

function setAiTutor(overrides: Partial<UseAiTutorResult> = {}) {
  mockedUseAiTutor.mockReturnValue({
    loading: false,
    result: null,
    error: false,
    active: false,
    requestHint: vi.fn(),
    ...overrides,
  });
}

function completeLessons(...lessonIds: string[]) {
  window.localStorage.setItem(
    lessonProgressStorageKey,
    JSON.stringify({
      completedLessonIds: lessonIds,
      dailyCompletionDates: [],
      totalXp: 0,
    }),
  );
}

function renderPractice({ rng = createSeededRng(7), sessionSize = 3 } = {}) {
  return render(
    <MemoryRouter>
      <PracticePage rng={rng} sessionSize={sessionSize} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  playEffectMock.mockClear();
  setAiTutor();
  mockedUseAuth.mockReturnValue({
    user: null,
    loading: false,
    isConfigured: true,
    loginWithGoogle: vi.fn(),
    loginWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    logout: vi.fn(),
    updateDisplayName: vi.fn(),
    deleteAccount: vi.fn(),
  });
});

describe('PracticePage gating', () => {
  it('locks practice until at least one lesson is complete', () => {
    renderPractice();

    expect(
      screen.getByRole('heading', { name: 'Complete a lesson to unlock practice.' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Practice progress')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('unlocks and starts the session as soon as a single lesson is complete', () => {
    // Finishing just one of Limits' two lessons unlocks that lesson's questions
    // and drops the learner straight into the session (no intro / Start button).
    completeLessons('what-changes');
    renderPractice();

    // Not the locked state, and the live session (counter + choices) is present.
    expect(screen.queryByText('Complete a lesson to unlock practice.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Practice progress')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('shows an empty state when the completed lessons have no questions yet', () => {
    // Behavior Intro is complete but the fixture bank has no questions for it.
    completeLessons('deriv-intro');
    renderPractice();

    expect(
      screen.getByRole('heading', { name: 'No practice questions yet.' }),
    ).toBeInTheDocument();
  });
});

describe('PracticePage round sizes', () => {
  it('defaults the regular round to 20 questions', () => {
    completeLessons('big-set');
    // Render with the DEFAULT sessionSize (no override). AI is disabled in the
    // test runner, so there is no challenge round to extend the count and the
    // continuous counter total is just the 20-question regular round. The session
    // auto-starts on load, so the first question shows immediately.
    render(
      <MemoryRouter>
        <PracticePage rng={createSeededRng(7)} />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 1 of 20');
  });
});

describe('PracticePage unified pool', () => {
  it('starts a randomized session immediately on load (no intro / Start button)', () => {
    completeLessons('what-changes', 'slope-refresher');
    renderPractice();

    // The first question + continuous counter are visible immediately and there
    // is no "Start practice" affordance (the intro screen was removed). The total
    // is 4: a 3-question bank round plus a 1-question static challenge (one bank
    // question is left unused, so even with AI off the round backfills statically).
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 1 of 4');
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start practice' })).not.toBeInTheDocument();
  });

  it('keeps the question after submitting, reveals feedback, then advances', async () => {
    const user = userEvent.setup();
    completeLessons('what-changes', 'slope-refresher');
    renderPractice();

    const firstRadio = document.querySelector<HTMLInputElement>('input[type="radio"]');
    expect(firstRadio).not.toBeNull();
    await user.click(firstRadio as HTMLInputElement);
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    // Awarding XP/streak on submit must NOT reset the session.
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 1 of 4');
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Next random question|View summary/ }));
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 2 of 4');
  });

  it('completes a session and shows the mixed-set summary', async () => {
    const user = userEvent.setup();
    // Complete a single 2-question lesson and run a 2-question session so the
    // whole bank pool is used (no unused questions) — with AI off there is then no
    // static challenge round, exercising the plain bank-only summary path.
    completeLessons('what-changes');
    renderPractice({ sessionSize: 2 });

    for (let index = 0; index < 2; index += 1) {
      const radio = document.querySelector<HTMLInputElement>('input[type="radio"]');
      await user.click(radio as HTMLInputElement);
      await user.click(screen.getByRole('button', { name: 'Submit answer' }));
      await user.click(screen.getByRole('button', { name: /Next random question|View summary/ }));
    }

    expect(screen.getByRole('heading', { name: 'Practice summary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start another mixed set' })).toBeInTheDocument();
    // No challenge round (AI off AND no unused bank questions): the summary
    // reflects only the 2 bank questions answered (both correct).
    expect(
      screen.getByText(/You answered 2 questions from this mixed set with 100% correct/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/bonus challenge question/)).not.toBeInTheDocument();
  });
});

describe('PracticePage AI decoupling', () => {
  // AI is disabled in tests; forcing navigator offline as well proves the full
  // response history (questionAttempts + topicStats + recentMistakes) is recorded
  // and the static explanation shown regardless of AI/connectivity.
  it('records full response history when AI is disabled and offline', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });

    try {
      completeLessons('what-changes', 'slope-refresher');
      renderPractice({ sessionSize: 1 });

      // Choose the WRONG option ('b') so a recentMistake is recorded too.
      const wrongRadio = document.querySelector<HTMLInputElement>(
        'input[type="radio"][value="b"]',
      );
      await user.click(wrongRadio as HTMLInputElement);
      await user.click(screen.getByRole('button', { name: 'Submit answer' }));

      // Static feedback shows; no AI tutor note appears.
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(document.querySelector('.ai-tutor-note')).toBeNull();

      const stored = JSON.parse(window.localStorage.getItem(lessonProgressStorageKey) ?? '{}');
      // One attempt recorded.
      expect(Object.keys(stored.questionAttempts ?? {})).toHaveLength(1);
      // topicStats keyed by `${chapterId}/${category}` for practice.
      expect(stored.topicStats?.['limits/sample']).toEqual({
        correct: 0,
        incorrect: 1,
      });
      // The wrong answer is captured in the newest-first recentMistakes list.
      expect(stored.recentMistakes).toHaveLength(1);
      expect(stored.recentMistakes[0]).toMatchObject({
        topicKey: 'limits/sample',
      });
    } finally {
      delete (window.navigator as { onLine?: boolean }).onLine;
    }
  });
});

// With AI ENABLED + online (mocked), the coach is preferred for practice feedback
// and the static explanation must not appear unless the AI request falls back.
describe('PracticePage AI tutor gating', () => {
  async function answerFirstQuestion(user: ReturnType<typeof userEvent.setup>) {
    completeLessons('what-changes', 'slope-refresher');
    renderPractice({ sessionSize: 1 });
    const radio = document.querySelector<HTMLInputElement>('input[type="radio"]');
    await user.click(radio as HTMLInputElement);
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));
  }

  it('shows ONLY the AI loader (static feedback hidden) while the reply is pending', async () => {
    const user = userEvent.setup();
    setAiTutor({ active: true }); // active, no result, no error => pending
    await answerFirstQuestion(user);

    expect(screen.getByLabelText('The AI tutor is thinking')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Because A is correct/)).not.toBeInTheDocument();
  });

  it('shows the AI coach message and hides the static feedback on success', async () => {
    const user = userEvent.setup();
    setAiTutor({ active: true, result: { message: 'Choice A matches the definition precisely.' } });
    await answerFirstQuestion(user);

    expect(screen.getByText('Choice A matches the definition precisely.')).toBeInTheDocument();
    expect(document.querySelector('.ai-tutor-note')).not.toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('falls back to the static feedback when the AI reply errors/times out', async () => {
    const user = userEvent.setup();
    setAiTutor({ active: true, error: true }); // resolved with null => fallback
    await answerFirstQuestion(user);

    expect(screen.getByRole('alert')).toHaveTextContent(/Because A is correct/);
    expect(document.querySelector('.ai-tutor-note')).toBeNull();
  });
});

describe('PracticePage answer highlighting', () => {
  // On a wrong answer the picked choice must turn red AND the correct choice
  // must turn green simultaneously (revealing the answer key on the options
  // themselves). Reuses the global is-incorrect / is-correct option styles.
  it('marks the picked option red AND the correct option green on a wrong answer', async () => {
    const user = userEvent.setup();
    completeLessons('what-changes', 'slope-refresher');
    renderPractice({ sessionSize: 1 });

    // Every fixture question's correct choice is 'a', so 'b' is a wrong pick.
    await user.click(document.querySelector('input[type="radio"][value="b"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    const pickedOption = document
      .querySelector('input[type="radio"][value="b"]')
      ?.closest('.answer-option');
    const correctOption = document
      .querySelector('input[type="radio"][value="a"]')
      ?.closest('.answer-option');
    expect(pickedOption).toHaveClass('is-incorrect');
    expect(correctOption).toHaveClass('is-correct');
  });

  it('marks the chosen correct option green (and nothing red) on a right answer', async () => {
    const user = userEvent.setup();
    completeLessons('what-changes', 'slope-refresher');
    renderPractice({ sessionSize: 1 });

    await user.click(document.querySelector('input[type="radio"][value="a"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(
      document.querySelector('input[type="radio"][value="a"]')?.closest('.answer-option'),
    ).toHaveClass('is-correct');
    expect(document.querySelector('.answer-option.is-incorrect')).toBeNull();
  });
});

describe('PracticePage audio cues', () => {
  it('plays the correct cue when a practice answer is right', async () => {
    const user = userEvent.setup();
    completeLessons('what-changes', 'slope-refresher');
    renderPractice({ sessionSize: 1 });

    // Every fixture question's correct choice is 'a'.
    await user.click(document.querySelector('input[type="radio"][value="a"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(playEffectMock).toHaveBeenCalledWith('correct');
    expect(playEffectMock).not.toHaveBeenCalledWith('incorrect');
  });

  it('plays the incorrect cue when a practice answer is wrong', async () => {
    const user = userEvent.setup();
    completeLessons('what-changes', 'slope-refresher');
    renderPractice({ sessionSize: 1 });

    await user.click(document.querySelector('input[type="radio"][value="b"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(playEffectMock).toHaveBeenCalledWith('incorrect');
    expect(playEffectMock).not.toHaveBeenCalledWith('correct');
  });
});
