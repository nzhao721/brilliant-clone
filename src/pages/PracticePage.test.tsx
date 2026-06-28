import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { createSeededRng } from '../data/questionBank';
import { getTodayKey, lessonProgressStorageKey } from '../lessons/lessonProgress';
import { useAiTutor, type UseAiTutorResult } from '../lessons/useAiTutor';
import { PracticePage } from './PracticePage';

/* Mocked lessons + questions so the practice UI is exercised independently. Practice unlocks per lesson:
   "What Changes?"/"Slope Refresher"/"Derivative Basics" each own questions, "Behavior Intro" owns none (the empty-pool path). */
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

  /* A 20-question lesson to prove the regular round defaults to 20 (others stay small for the existing count assertions). */
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

/* Drive AI gating through the hook's state. Default inert (active: false) for the static-feedback assertions; AI-enabled cases override per test. */
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

/* These suites exercise the OPTIONAL free-practice flow, so they pass today's
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
    /* Finishing one of Limits' two lessons unlocks its questions and drops straight into the session (no intro/Start). */
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
    /* Default sessionSize, AI off → no challenge round, so the counter total is just the 20-question regular round (auto-starts on load). */
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

    /* First question + counter show immediately, no "Start practice". Total 4: a 3-question bank round + a 1-question static challenge (one bank question is unused, so the round backfills even with AI off). */
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
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    // Awarding XP/streak on submit must NOT reset the session.
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 1 of 4');
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Next random question|View summary/ }));
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 2 of 4');
  });

  it('completes a session and shows the mixed-set summary', async () => {
    const user = userEvent.setup();
    /* One 2-question lesson + a 2-question session uses the whole pool (no unused) — with AI off there's no challenge round, exercising the bank-only summary. */
    completeLessons('what-changes');
    renderPractice({ sessionSize: 2 });

    for (let index = 0; index < 2; index += 1) {
      const radio = document.querySelector<HTMLInputElement>('input[type="radio"]');
      await user.click(radio as HTMLInputElement);
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      await user.click(screen.getByRole('button', { name: /Next random question|View summary/ }));
    }

    expect(screen.getByRole('heading', { name: 'Practice summary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start another mixed set' })).toBeInTheDocument();
    /* No challenge round (AI off, no unused bank): summary reflects only the 2 bank questions (both correct). */
    expect(
      screen.getByText(/You answered 2 questions from this mixed set with 100% correct/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/bonus challenge question/)).not.toBeInTheDocument();
  });
});

describe('PracticePage AI decoupling', () => {
  /* AI off + forced offline proves full history (questionAttempts + topicStats + recentMistakes) records and the static explanation shows regardless. */
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
      await user.click(screen.getByRole('button', { name: 'Submit' }));

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

/* With AI enabled + online, the coach is preferred; the static explanation shows only on fallback. */
describe('PracticePage AI tutor gating', () => {
  async function answerFirstQuestion(user: ReturnType<typeof userEvent.setup>) {
    completeLessons('what-changes', 'slope-refresher');
    renderPractice({ sessionSize: 1 });
    const radio = document.querySelector<HTMLInputElement>('input[type="radio"]');
    await user.click(radio as HTMLInputElement);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
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
  /* Wrong answer: picked choice red AND correct choice green at once (global is-incorrect/is-correct styles). */
  it('marks the picked option red AND the correct option green on a wrong answer', async () => {
    const user = userEvent.setup();
    completeLessons('what-changes', 'slope-refresher');
    renderPractice({ sessionSize: 1 });

    // Every fixture question's correct choice is 'a', so 'b' is a wrong pick.
    await user.click(document.querySelector('input[type="radio"][value="b"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Submit' }));

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
    await user.click(screen.getByRole('button', { name: 'Submit' }));

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
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(playEffectMock).toHaveBeenCalledWith('correct');
    expect(playEffectMock).not.toHaveBeenCalledWith('incorrect');
  });

  it('plays the incorrect cue when a practice answer is wrong', async () => {
    const user = userEvent.setup();
    completeLessons('what-changes', 'slope-refresher');
    renderPractice({ sessionSize: 1 });

    await user.click(document.querySelector('input[type="radio"][value="b"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(playEffectMock).toHaveBeenCalledWith('incorrect');
    expect(playEffectMock).not.toHaveBeenCalledWith('correct');
  });
});

describe('PracticePage AI hint pop-up (practice-only)', () => {
  it('shows an "AI Hint" button beside Submit and opens it as a pop-up dialog', async () => {
    const user = userEvent.setup();
    completeLessons('what-changes', 'slope-refresher');
    renderPractice({ sessionSize: 1 });

    // The hint trigger sits next to Submit on the live (unanswered) card.
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    const hintButton = screen.getByRole('button', { name: 'AI Hint' });
    expect(hintButton).toBeInTheDocument();

    await user.click(hintButton);

    /* Opens a modal dialog. AI is disabled in the test runner, so the pre-check
     * shows the unavailable state (not the upload/whiteboard options) — and it
     * never throws. */
    expect(await screen.findByRole('dialog', { name: 'AI hint' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Upload work')).not.toBeInTheDocument();
  });

  it('removes the hint button once the question is answered', async () => {
    const user = userEvent.setup();
    completeLessons('what-changes', 'slope-refresher');
    renderPractice({ sessionSize: 1 });

    await user.click(document.querySelector('input[type="radio"]') as HTMLInputElement);
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.queryByRole('button', { name: 'AI Hint' })).not.toBeInTheDocument();
  });
});
