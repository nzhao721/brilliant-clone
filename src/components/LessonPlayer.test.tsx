import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lesson, LessonStep } from '../data/lessons';
import type { LessonCompletionAward } from '../lessons/lessonProgress';
import { useAiTutor, type UseAiTutorResult } from '../lessons/useAiTutor';
import { renderWithRouter } from '../test/renderWithRouter';
import { LessonPlayer } from './LessonPlayer';

// The component-level AI behavior is driven entirely by the hook's returned
// state, so we mock the hook to control the three AI-enabled outcomes
// (pending / success / fallback) deterministically. The default is INERT — AI
// off (active: false) — mirroring the real hook in the test runner so every
// pre-existing assertion (static text shown, no AI note) keeps passing.
vi.mock('../lessons/useAiTutor', () => ({
  useAiTutor: vi.fn(),
}));

// Capture the audio cues the player fires without a real SoundProvider. A
// single shared spy lets tests assert the exact effect names; the rest of the
// hook surface is inert.
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

beforeEach(() => {
  playEffectMock.mockClear();
  setAiTutor();
});

// Inline fixtures keep the player tests independent of the authored course
// content (filled in by other agents and possibly empty). `sampleLesson` mirrors
// the shape the player relies on: a 7-step lesson (2 concepts + 5 questions) so
// the partial-progress percentages (14% / 29% / 43%) stay exact.
function conceptStep(id: string, title: string, body: string): LessonStep {
  return { id, type: 'concept', title, body };
}

function questionStep(options: {
  id: string;
  title: string;
  prompt: string;
  choices: { id: string; label: string }[];
  correctOptionId: string;
  hint?: string;
  correctExplanation: string;
  incorrectExplanation: string;
}): LessonStep {
  return {
    id: options.id,
    type: 'multiple-choice',
    title: options.title,
    prompt: options.prompt,
    options: options.choices,
    correctOptionId: options.correctOptionId,
    correctExplanation: options.correctExplanation,
    incorrectExplanation: options.incorrectExplanation,
    hint: options.hint,
  };
}

const sampleLesson: Lesson = {
  id: 'what-changes',
  chapterId: 'functions-and-graphs',
  title: 'What Changes?',
  description: 'A sample lesson.',
  status: 'available',
  estimatedMinutes: 5,
  steps: [
    conceptStep('c0', 'Functions describe change', 'A function pairs inputs and outputs: $f(x) = x^2$.'),
    questionStep({
      id: 'q1',
      title: 'Spot the change',
      prompt: 'How much did the output change?',
      choices: [
        { id: 'one', label: 'By $1$' },
        { id: 'four', label: 'By $4$' },
      ],
      correctOptionId: 'four',
      hint: 'Look only at the two outputs.',
      correctExplanation: 'Correct. The output changed by $4$.',
      incorrectExplanation:
        'Not quite. Compare the ending output to the starting output, not the input values.',
    }),
    conceptStep('c2', 'Change becomes rate', 'Dividing change in output by change in input gives a rate.'),
    questionStep({
      id: 'q3',
      title: 'Find the input change',
      prompt: 'How much did the input change?',
      choices: [
        { id: 'two', label: '$2$' },
        { id: 'three', label: '$3$' },
      ],
      correctOptionId: 'three',
      correctExplanation: 'Correct. The input moved by $3$.',
      incorrectExplanation: 'Not quite. Recount the input step.',
    }),
    questionStep({
      id: 'q4',
      title: 'Compute the rate',
      prompt: 'What is the average rate?',
      choices: [
        { id: 'five', label: '$5$' },
        { id: 'six', label: '$6$' },
      ],
      correctOptionId: 'six',
      correctExplanation: 'Correct. The rate is $6$.',
      incorrectExplanation: 'Not quite. Divide output change by input change.',
    }),
    questionStep({
      id: 'q5',
      title: 'Sign of the rate',
      prompt: 'Is the rate positive or negative?',
      choices: [
        { id: 'positive', label: 'Positive' },
        { id: 'negative', label: 'Negative' },
      ],
      correctOptionId: 'positive',
      correctExplanation: 'Correct. The output is rising, so the rate is positive.',
      incorrectExplanation: 'Not quite. The output is increasing.',
    }),
    questionStep({
      id: 'q6',
      title: 'How many inputs?',
      prompt: 'How many inputs are in the table?',
      choices: [
        { id: 'two', label: '$2$' },
        { id: 'three', label: '$3$' },
      ],
      correctOptionId: 'two',
      correctExplanation: 'Correct. There are $2$ inputs.',
      incorrectExplanation: 'Not quite. Count the rows again.',
    }),
  ],
};

const nextLessonFixture: Pick<Lesson, 'id' | 'title'> = {
  id: 'slope-refresher',
  title: 'Slope Refresher',
};

const followUpLesson: Lesson = {
  id: 'slope-refresher',
  chapterId: 'functions-and-graphs',
  title: 'Slope Refresher',
  description: 'Another sample lesson.',
  status: 'available',
  estimatedMinutes: 4,
  steps: [
    conceptStep('s0', 'Slope measures steepness', 'Slope is rise over run.'),
    questionStep({
      id: 's1',
      title: 'Pick the slope',
      prompt: 'What is the slope?',
      choices: [
        { id: 'one', label: '$1$' },
        { id: 'two', label: '$2$' },
      ],
      correctOptionId: 'two',
      correctExplanation: 'Correct.',
      incorrectExplanation: 'Try again.',
    }),
  ],
};

const mathChoiceLesson: Lesson = {
  id: 'math-choice',
  chapterId: 'functions-and-graphs',
  title: 'Math Choice',
  description: 'Lesson with math inside a choice.',
  status: 'available',
  estimatedMinutes: 3,
  steps: [
    conceptStep('mc-intro', 'Intro', 'Read the prompt then choose.'),
    questionStep({
      id: 'mc-question',
      title: 'Why decorative?',
      prompt: 'Choose the best reason.',
      choices: [
        { id: 'plain', label: 'No reason' },
        { id: 'style', label: 'Because $x$ is always decorative' },
      ],
      correctOptionId: 'plain',
      correctExplanation: 'Correct.',
      incorrectExplanation: 'Not quite.',
    }),
  ],
};

// A lesson whose first concept slide ships an interactive visual (so it gets the
// "Show me" self-demonstration button + interaction gate) followed by a question
// that ALSO has a visual (to prove the button is concept-only and never appears
// on a question). Uses an original-7 visual type so the InteractiveGraph demo
// path is exercised end-to-end through the player.
const visualLesson: Lesson = {
  id: 'visual-lesson',
  chapterId: 'functions-and-graphs',
  title: 'Visual Lesson',
  description: 'A lesson with interactive visuals.',
  status: 'available',
  estimatedMinutes: 4,
  steps: [
    {
      id: 'cv-concept',
      type: 'concept',
      title: 'Glide along the curve',
      body: 'Drag the point to read $f(x)$.',
      visual: { type: 'function-cursor', label: 'Explore $f$', initialX: 1 },
    },
    {
      id: 'cv-plain-concept',
      type: 'concept',
      title: 'No figure here',
      body: 'This concept has no interactive.',
    },
    {
      id: 'cv-question',
      type: 'multiple-choice',
      title: 'Read the value',
      prompt: 'What is $f(2)$?',
      options: [
        { id: 'two', label: '$2$' },
        { id: 'four', label: '$4$' },
      ],
      correctOptionId: 'two',
      hint: 'Drag the point to $x = 2$.',
      correctExplanation: 'Correct.',
      incorrectExplanation: 'Not quite.',
      visual: { type: 'function-cursor', label: 'Explore $f$', initialX: 1 },
    },
  ],
};

// coinsGained is intentionally distinct from every XP figure (lessonXp,
// dailyBonusXp, totalXpGained) because coins are no longer 1:1 with XP. Keeping
// them different means any completion-screen coin number accidentally sourced
// from an XP value would render the wrong figure and fail these tests.
const award: LessonCompletionAward = {
  alreadyCompleted: false,
  coinsGained: 40,
  dailyBonusXp: 25,
  questionsAnswered: 5,
  lessonXp: 100,
  totalXpGained: 125,
};

function getRadioByValue(value: string) {
  const radio = document.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`);

  if (!radio) {
    throw new Error(`Could not find radio option with value "${value}"`);
  }

  return radio;
}

function getLessonProgressFill() {
  const progressFill = document.querySelector<HTMLElement>('.lesson-progress .progress-fill');

  if (!progressFill) {
    throw new Error('Could not find lesson progress fill');
  }

  return progressFill;
}

async function completeSampleLesson(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(getRadioByValue('four'));
  await user.click(screen.getByRole('button', { name: 'Submit answer' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(getRadioByValue('three'));
  await user.click(screen.getByRole('button', { name: 'Submit answer' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(getRadioByValue('six'));
  await user.click(screen.getByRole('button', { name: 'Submit answer' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(getRadioByValue('positive'));
  await user.click(screen.getByRole('button', { name: 'Submit answer' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(getRadioByValue('two'));
  await user.click(screen.getByRole('button', { name: 'Submit answer' }));
  await user.click(screen.getByRole('button', { name: 'Finish lesson' }));
}

describe('LessonPlayer', () => {
  it('renders the first concept step and advances to a question', async () => {
    const user = userEvent.setup();
    const { container } = render(<LessonPlayer lesson={sampleLesson} />);

    expect(screen.getByRole('heading', { name: 'Functions describe change' })).toBeInTheDocument();
    expect(screen.getByLabelText('What Changes? - lesson progress')).toHaveTextContent(
      'Step 1 of 7',
    );
    expect(container.querySelector('.katex')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('heading', { name: 'Spot the change' })).toBeInTheDocument();
  });

  it('keeps inline math inside one answer choice copy wrapper', async () => {
    const user = userEvent.setup();
    const { container } = render(<LessonPlayer lesson={mathChoiceLesson} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));

    const decorativeChoice = container.querySelector('input[value="style"]');
    const answerCopy = decorativeChoice?.closest('label')?.querySelector('.answer-option-copy');

    expect(decorativeChoice).toBeInTheDocument();
    expect(answerCopy).toBeInTheDocument();
    expect(answerCopy).toHaveTextContent('Because');
    expect(answerCopy).toHaveTextContent('is always decorative');
    expect(answerCopy?.querySelector('.katex')).toBeInTheDocument();
  });

  it('shows hints and correct answer explanations', async () => {
    const user = userEvent.setup();
    const onCorrectAnswer = vi.fn();
    render(<LessonPlayer lesson={sampleLesson} onCorrectAnswer={onCorrectAnswer} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Show hint' }));

    expect(screen.getByRole('status')).toHaveTextContent(/Look only at the two/);

    await user.click(getRadioByValue('four'));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Correct\. The output changed by/);
    expect(screen.getByRole('alert').querySelector('.katex')).toBeInTheDocument();
    // Once answered, the hint is hidden entirely; only the answer explanation
    // remains (no lingering hint alongside the correct-answer feedback).
    expect(screen.queryByText(/Look only at the two/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(onCorrectAnswer).toHaveBeenCalledWith('q1');
    expect(onCorrectAnswer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Submit answer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show hint' })).toBeDisabled();
  });

  it('lets students retry after an incorrect answer', async () => {
    const user = userEvent.setup();
    const onCorrectAnswer = vi.fn();
    render(<LessonPlayer lesson={sampleLesson} onCorrectAnswer={onCorrectAnswer} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.click(getRadioByValue('one'));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Not quite. Compare the ending output to the starting output, not the input values.',
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Show hint' })).toBeEnabled();
    expect(getRadioByValue('one')).toBeDisabled();
    expect(getRadioByValue('four')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByRole('button', { name: 'Submit answer' })).toBeDisabled();
    expect(getRadioByValue('one')).toBeEnabled();
    expect(getRadioByValue('four')).toBeEnabled();
    await user.click(getRadioByValue('four'));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Correct\. The output changed by/);
    expect(screen.getByRole('alert').querySelector('.katex')).toBeInTheDocument();
    expect(onCorrectAnswer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('hides both the hint and the wrong-answer feedback after clicking "Try again"', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={sampleLesson} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Show hint' }));

    // AI is disabled, so the static hint shows while the question is unanswered.
    expect(screen.getByRole('status')).toHaveTextContent(/Look only at the two/);

    await user.click(getRadioByValue('one'));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    // A wrong answer shows the incorrect feedback and hides the hint.
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Not quite. Compare the ending output to the starting output, not the input values.',
    );

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    // After "Try again", NEITHER the hint NOR the wrong-answer feedback remains,
    // and the hint does not reappear (showHint was reset alongside answerResult).
    expect(screen.queryByText(/Look only at the two/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Not quite\. Compare the ending output/),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('records one incorrect then one correct attempt for a wrong-then-right answer', async () => {
    const user = userEvent.setup();
    const onAttempt = vi.fn();
    const onCorrectAnswer = vi.fn();
    render(
      <LessonPlayer
        lesson={sampleLesson}
        onAttempt={onAttempt}
        onCorrectAnswer={onCorrectAnswer}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.click(getRadioByValue('one'));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await user.click(getRadioByValue('four'));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(onAttempt).toHaveBeenCalledTimes(2);
    expect(onAttempt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ questionId: 'q1', isCorrect: false, chosenChoiceId: 'one' }),
    );
    expect(onAttempt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ questionId: 'q1', isCorrect: true, chosenChoiceId: 'four' }),
    );
    expect(onCorrectAnswer).toHaveBeenCalledTimes(1);
  });

  it('preserves an incorrect question state when navigating away and back', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={sampleLesson} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Show hint' }));
    await user.click(getRadioByValue('one'));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(getRadioByValue('one')).toBeChecked();
    // The hint stays hidden while the question is answered, even though showHint
    // was preserved across navigation.
    expect(screen.queryByText(/Look only at the two/)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Not quite. Compare the ending output to the starting output, not the input values.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(getRadioByValue('one')).toBeDisabled();
    expect(getRadioByValue('four')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    // "Try again" clears the result AND the preserved showHint flag, so neither
    // the wrong-answer feedback nor the hint reappears.
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.queryByText(/Look only at the two/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('preserves a correct question state when navigating away and back', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={sampleLesson} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(getRadioByValue('four'));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(getRadioByValue('four')).toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent(/Correct\. The output changed by/);
    expect(screen.getByRole('button', { name: 'Submit answer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('restores saved lesson step and question progress', async () => {
    const user = userEvent.setup();
    render(
      <LessonPlayer
        initialProgress={{
          questionStates: {
            q1: {
              answerResult: 'incorrect',
              selectedOptionId: 'one',
              showHint: true,
            },
          },
          stepIndex: 1,
        }}
        lesson={sampleLesson}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Spot the change' })).toBeInTheDocument();
    expect(screen.getByLabelText('What Changes? - lesson progress')).toHaveTextContent(
      'Step 2 of 7',
    );
    expect(getRadioByValue('one')).toBeChecked();
    expect(getRadioByValue('one')).toBeDisabled();
    // The restored answer hides the hint, and "Try again" also clears the
    // showHint flag, so the hint does not reappear after retrying.
    expect(screen.queryByText(/Look only at the two/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.queryByText(/Look only at the two/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('saves resume position while counting only completed steps for progress', async () => {
    const user = userEvent.setup();
    const onProgressChange = vi.fn();
    render(<LessonPlayer lesson={sampleLesson} onProgressChange={onProgressChange} />);

    expect(getLessonProgressFill()).toHaveStyle({ width: '0%' });

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(onProgressChange).toHaveBeenLastCalledWith({
        questionStates: {},
        stepIndex: 1,
      }),
    );
    expect(getLessonProgressFill()).toHaveStyle({ width: '14%' });

    await user.click(screen.getByRole('button', { name: 'Show hint' }));
    await user.click(getRadioByValue('four'));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    await waitFor(() =>
      expect(onProgressChange).toHaveBeenLastCalledWith({
        questionStates: {
          q1: {
            answerResult: 'correct',
            selectedOptionId: 'four',
            showHint: true,
          },
        },
        stepIndex: 1,
      }),
    );
    expect(getLessonProgressFill()).toHaveStyle({ width: '29%' });

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Change becomes rate' })).toBeInTheDocument();
    expect(getLessonProgressFill()).toHaveStyle({ width: '29%' });

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(onProgressChange).toHaveBeenLastCalledWith({
        questionStates: {
          q1: {
            answerResult: 'correct',
            selectedOptionId: 'four',
            showHint: true,
          },
        },
        stepIndex: 3,
      }),
    );
    expect(screen.getByRole('heading', { name: 'Find the input change' })).toBeInTheDocument();
    expect(getLessonProgressFill()).toHaveStyle({ width: '43%' });
  });

  it('can finish and review a lesson, showing both coins and XP earned', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={sampleLesson} onComplete={() => award} />);

    await completeSampleLesson(user);

    expect(screen.getByRole('heading', { name: 'Nice work on What Changes?' })).toBeInTheDocument();
    // Coins and XP are reported separately; coins are no longer 1:1 with XP, so
    // the earned-coin figure is coinsGained (40) while XP earned is totalXpGained.
    expect(screen.getByLabelText('+40 coins earned')).toBeInTheDocument();
    expect(screen.getByLabelText('+125 XP earned')).toBeInTheDocument();
    // The detail line keeps the real XP (100) but its coin figure is coinsGained
    // (40) — the same number as the headline — not the lesson's XP value.
    expect(screen.getByText('5 questions answered: +100 XP & +40 coins')).toBeInTheDocument();
    // The streak bonus grants XP only, so it reports no coins at all.
    expect(screen.getByText('Streak bonus: +25 XP')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Review lesson' }));

    expect(screen.getByRole('heading', { name: 'Functions describe change' })).toBeInTheDocument();
  });

  it('sources every earned-coin figure on the completion screen from coinsGained', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={sampleLesson} onComplete={() => award} />);

    await completeSampleLesson(user);

    // The headline chip and the per-question detail line must report the SAME
    // coin figure, and it must be coinsGained — every XP value differs from it.
    expect(screen.getByLabelText(`+${award.coinsGained} coins earned`)).toBeInTheDocument();
    expect(
      screen.getByText(
        `${award.questionsAnswered} questions answered: +${award.lessonXp} XP & +${award.coinsGained} coins`,
      ),
    ).toBeInTheDocument();

    // Regression guards for the original bug (coins read off an XP value): no XP
    // number may ever be rendered as a coins amount on the completion screen.
    expect(
      screen.queryByText(new RegExp(`\\+${award.lessonXp} coins`)),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(new RegExp(`\\+${award.totalXpGained} coins`)),
    ).not.toBeInTheDocument();
    // The streak bonus grants XP only, so it must not claim any coins.
    expect(screen.queryByText(/Streak bonus:.*coins/)).not.toBeInTheDocument();
  });

  it('keeps the earned-coin headline consistent with the coin-balance increment', async () => {
    const user = userEvent.setup();
    // The host passes the already-incremented running balance. Pairing a known
    // starting balance with this award documents that the balance grew by exactly
    // the headline "coins earned" figure (coinsGained), so the two never disagree.
    const startingCoinBalance = 300;
    render(
      <LessonPlayer
        lesson={sampleLesson}
        onComplete={() => award}
        coinBalance={startingCoinBalance + award.coinsGained}
        totalXp={1250}
      />,
    );

    await completeSampleLesson(user);

    expect(screen.getByLabelText(`+${award.coinsGained} coins earned`)).toBeInTheDocument();
    const totals = screen.getByLabelText('Your totals');
    expect(totals).toHaveTextContent(
      (startingCoinBalance + award.coinsGained).toLocaleString(),
    );
  });

  it('shows running coin balance and XP totals on completion when provided', async () => {
    const user = userEvent.setup();
    render(
      <LessonPlayer
        lesson={sampleLesson}
        onComplete={() => award}
        coinBalance={340}
        totalXp={1250}
      />,
    );

    // The in-lesson step view never shows a coins/XP HUD, even with totals supplied.
    expect(screen.queryByLabelText('Your balances')).not.toBeInTheDocument();

    await completeSampleLesson(user);

    const totals = screen.getByLabelText('Your totals');
    expect(totals).toHaveTextContent('Coin balance');
    expect(totals).toHaveTextContent('340');
    expect(totals).toHaveTextContent('Total XP');
    expect(totals).toHaveTextContent('1,250');
  });

  it('shows a next lesson link after completing a lesson when a next lesson exists', async () => {
    const user = userEvent.setup();
    renderWithRouter(<LessonPlayer lesson={sampleLesson} nextLesson={nextLessonFixture} />);

    await completeSampleLesson(user);

    expect(screen.getByRole('link', { name: 'Next lesson: Slope Refresher' })).toHaveAttribute(
      'href',
      '/lessons/slope-refresher',
    );
    expect(screen.getByRole('button', { name: 'Review lesson' })).toBeInTheDocument();
  });

  it('starts the next lesson when the lesson prop changes after completion', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MemoryRouter>
        <LessonPlayer lesson={sampleLesson} nextLesson={nextLessonFixture} onComplete={() => award} />
      </MemoryRouter>,
    );

    await completeSampleLesson(user);
    expect(screen.getByRole('heading', { name: 'Nice work on What Changes?' })).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <LessonPlayer lesson={followUpLesson} onComplete={() => award} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Slope measures steepness' })).toBeInTheDocument();
    expect(screen.getByLabelText('Slope Refresher - lesson progress')).toHaveTextContent(
      'Step 1 of 2',
    );
    expect(screen.queryByRole('heading', { name: 'Nice work on Slope Refresher' })).not.toBeInTheDocument();
    expect(screen.queryByText('Already completed: no new XP')).not.toBeInTheDocument();
  });

  it('omits the next lesson link when there is no next lesson', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={sampleLesson} />);

    await completeSampleLesson(user);

    expect(screen.queryByRole('link', { name: /Next lesson/i })).not.toBeInTheDocument();
  });

  it('shows zero coins and XP when a previously completed lesson is finished again', async () => {
    const user = userEvent.setup();
    render(
      <LessonPlayer
        lesson={sampleLesson}
        onComplete={() => ({
          alreadyCompleted: true,
          coinsGained: 0,
          dailyBonusXp: 0,
          lessonXp: 0,
          questionsAnswered: 5,
          totalXpGained: 0,
        })}
      />,
    );

    await completeSampleLesson(user);

    expect(screen.getByLabelText('+0 coins earned')).toBeInTheDocument();
    expect(screen.getByLabelText('+0 XP earned')).toBeInTheDocument();
    expect(screen.getByText('Already completed: no new coins or XP')).toBeInTheDocument();
  });

  it('notifies when a lesson is completed', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn(() => award);
    render(<LessonPlayer lesson={sampleLesson} onComplete={onComplete} />);

    await completeSampleLesson(user);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  // Decoupling: AI is disabled in tests; this also forces navigator offline to
  // prove response history is recorded and the static feedback shown regardless
  // of AI/connectivity, with no AI text rendered.
  it('records the response and keeps static feedback when AI is disabled and offline', async () => {
    const user = userEvent.setup();
    const onAttempt = vi.fn();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });

    try {
      render(<LessonPlayer lesson={sampleLesson} onAttempt={onAttempt} />);

      await user.click(screen.getByRole('button', { name: 'Next' }));
      await user.click(getRadioByValue('one'));
      await user.click(screen.getByRole('button', { name: 'Submit answer' }));

      // History always records, independent of AI/connectivity.
      expect(onAttempt).toHaveBeenCalledTimes(1);
      expect(onAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ questionId: 'q1', isCorrect: false, chosenChoiceId: 'one' }),
      );

      // The static explanation remains; no AI tutor note appears.
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Not quite. Compare the ending output to the starting output, not the input values.',
      );
      expect(document.querySelector('.ai-tutor-note')).toBeNull();
    } finally {
      delete (window.navigator as { onLine?: boolean }).onLine;
    }
  });

  it('shows static feedback (and no AI note) on a correct answer with AI disabled', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={sampleLesson} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(getRadioByValue('four'));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Correct\. The output changed by/);
    expect(document.querySelector('.ai-tutor-note')).toBeNull();
  });
});

describe('LessonPlayer audio cues', () => {
  it('plays the correct cue when an answer is submitted correctly', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={sampleLesson} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(getRadioByValue('four'));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(playEffectMock).toHaveBeenCalledWith('correct');
    expect(playEffectMock).not.toHaveBeenCalledWith('incorrect');
  });

  it('plays the incorrect cue when an answer is wrong', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={sampleLesson} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(getRadioByValue('one'));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(playEffectMock).toHaveBeenCalledWith('incorrect');
    expect(playEffectMock).not.toHaveBeenCalledWith('correct');
  });

  it('plays a soft select cue when advancing to the next step', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={sampleLesson} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(playEffectMock).toHaveBeenCalledWith('select');
  });

  it('plays the lessonComplete, xp, then coin celebration on completion', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={sampleLesson} onComplete={() => award} />);

    await completeSampleLesson(user);

    const names = playEffectMock.mock.calls.map(([name]) => name);
    const completeIndex = names.indexOf('lessonComplete');
    expect(completeIndex).toBeGreaterThanOrEqual(0);
    // The award screen flourish fires in order: fanfare, then xp, then coin.
    expect(names[completeIndex + 1]).toBe('xp');
    expect(names[completeIndex + 2]).toBe('coin');
  });
});

// The "Show me" self-demonstration affordance is concept-slide only. In jsdom
// (no matchMedia) the demo honors reduced motion by jumping straight to the
// target synchronously, which also fires the gating interaction — so a click is
// enough to both demonstrate and satisfy the concept gate, no timers needed.
describe('LessonPlayer Show me self-demonstration', () => {
  it('shows a "Show me" button on a concept slide that has an interactive', () => {
    render(<LessonPlayer lesson={visualLesson} />);

    expect(screen.getByRole('heading', { name: 'Glide along the curve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show me/i })).toBeInTheDocument();
  });

  it('renders the "Show me" button as a plain text label with no icon', () => {
    render(<LessonPlayer lesson={visualLesson} />);

    const button = screen.getByRole('button', { name: /show me/i });
    // The button keeps its label and behavior but no longer carries an icon glyph.
    expect(button).toHaveTextContent('Show me');
    expect(button.querySelector('svg')).toBeNull();
  });

  it('keeps the "Show me" button inside the figure visual panel, not the controls row', () => {
    const { container } = render(<LessonPlayer lesson={visualLesson} />);

    const button = screen.getByRole('button', { name: /show me/i });
    const visualPanel = container.querySelector('.lesson-step-visual');
    const controlsRow = container.querySelector('.lesson-controls');

    // The button is an overlay anchored inside the figure panel (a sibling of the
    // interactive graph), so its corner placement never reintroduces a separate
    // vertical row. It must NOT live in the bottom navigation controls row.
    expect(visualPanel).toBeInTheDocument();
    expect(visualPanel).toContainElement(button);
    expect(controlsRow).toBeInTheDocument();
    expect(controlsRow).not.toContainElement(button);
  });

  it('omits the "Show me" button on a concept slide with no interactive', () => {
    // The sample lesson's first concept step has no visual.
    render(<LessonPlayer lesson={sampleLesson} />);

    expect(screen.getByRole('heading', { name: 'Functions describe change' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show me/i })).not.toBeInTheDocument();
  });

  it('gates the concept slide until "Show me" demonstrates the interactive', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={visualLesson} />);

    // A concept slide with a visual is gated: Next is disabled and the hint shows.
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByText('Interact with the graph to continue.')).toBeInTheDocument();

    // Clicking "Show me" runs the self-demo, which counts as the interaction and
    // opens the gate (the reduced-motion jump fires onInteractionComplete).
    await user.click(screen.getByRole('button', { name: /show me/i }));

    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(screen.queryByText('Interact with the graph to continue.')).not.toBeInTheDocument();
  });

  it('never renders "Show me" on a question slide, even one with an interactive', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={visualLesson} />);

    // Demonstrate to clear the first concept gate, then advance past the plain
    // concept, landing on the question step (which carries its own visual).
    await user.click(screen.getByRole('button', { name: /show me/i }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('heading', { name: 'Read the value' })).toBeInTheDocument();
    // The question keeps ONLY its text "Show hint"; it never gets a "Show me".
    expect(screen.queryByRole('button', { name: /show me/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show hint' })).toBeInTheDocument();
  });

  it('resets the demonstrate counter when navigating to another step', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={visualLesson} />);

    // Demonstrate, advance, then come back: the button is freshly mounted (its
    // counter reset) and continues to work on return.
    await user.click(screen.getByRole('button', { name: /show me/i }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('heading', { name: 'Glide along the curve' })).toBeInTheDocument();
    const showMe = screen.getByRole('button', { name: /show me/i });
    expect(showMe).toBeInTheDocument();
    // Re-clicking replays without error and the gate stays satisfied.
    await user.click(showMe);
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });
});

// With AI ENABLED + online (mocked), the AI coach is preferred and the static
// text must never appear unless the AI request falls back. These cover all three
// states for the answer-feedback instance AND the "Show hint" instance.
describe('LessonPlayer AI tutor gating', () => {
  async function submitCorrectAnswer(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(getRadioByValue('four'));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));
  }

  async function openHint(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Show hint' }));
  }

  it('shows ONLY the AI loader (static explanation hidden) while the reply is pending', async () => {
    const user = userEvent.setup();
    setAiTutor({ active: true }); // active, no result, no error => pending
    render(<LessonPlayer lesson={sampleLesson} />);

    await submitCorrectAnswer(user);

    expect(screen.getByLabelText('The AI tutor is thinking')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Correct\. The output changed by/)).not.toBeInTheDocument();
  });

  it('shows the AI coach message and hides the static explanation on success', async () => {
    const user = userEvent.setup();
    setAiTutor({ active: true, result: { message: 'You compared the two outputs perfectly.' } });
    render(<LessonPlayer lesson={sampleLesson} />);

    await submitCorrectAnswer(user);

    expect(screen.getByText('You compared the two outputs perfectly.')).toBeInTheDocument();
    expect(document.querySelector('.ai-tutor-note')).not.toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Correct\. The output changed by/)).not.toBeInTheDocument();
  });

  it('falls back to the static explanation when the AI reply errors/times out', async () => {
    const user = userEvent.setup();
    setAiTutor({ active: true, error: true }); // resolved with null => fallback
    render(<LessonPlayer lesson={sampleLesson} />);

    await submitCorrectAnswer(user);

    expect(screen.getByRole('alert')).toHaveTextContent(/Correct\. The output changed by/);
    expect(document.querySelector('.ai-tutor-note')).toBeNull();
  });

  it('shows ONLY the AI hint loader (static hint hidden) while a hint is pending', async () => {
    const user = userEvent.setup();
    setAiTutor({ active: true });
    render(<LessonPlayer lesson={sampleLesson} />);

    await openHint(user);

    expect(screen.getByLabelText('The AI tutor is thinking')).toBeInTheDocument();
    expect(screen.queryByText(/Look only at the two/)).not.toBeInTheDocument();
  });

  it('shows the AI hint message and hides the static hint on success', async () => {
    const user = userEvent.setup();
    setAiTutor({ active: true, result: { message: 'Focus on how the output value moves.' } });
    render(<LessonPlayer lesson={sampleLesson} />);

    await openHint(user);

    expect(screen.getByText('Focus on how the output value moves.')).toBeInTheDocument();
    expect(screen.queryByText(/Look only at the two/)).not.toBeInTheDocument();
  });

  it('falls back to the static hint when the AI hint errors/times out', async () => {
    const user = userEvent.setup();
    setAiTutor({ active: true, error: true });
    render(<LessonPlayer lesson={sampleLesson} />);

    await openHint(user);

    expect(screen.getByRole('status')).toHaveTextContent(/Look only at the two/);
    expect(document.querySelector('.ai-tutor-note')).toBeNull();
  });
});
