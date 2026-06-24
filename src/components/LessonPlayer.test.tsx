import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { lessons } from '../data/lessons';
import type { LessonCompletionAward } from '../lessons/lessonProgress';
import { renderWithRouter } from '../test/renderWithRouter';
import { LessonPlayer } from './LessonPlayer';

const starterLesson = lessons[0];
const award: LessonCompletionAward = {
  alreadyCompleted: false,
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

async function completeStarterLesson(user: ReturnType<typeof userEvent.setup>) {
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
    const { container } = render(<LessonPlayer lesson={starterLesson} />);

    expect(screen.getByRole('heading', { name: 'Functions describe change' })).toBeInTheDocument();
    expect(screen.getByLabelText('What Changes? — lesson progress')).toHaveTextContent(
      'Step 1 of 7',
    );
    expect(container.querySelector('.katex')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('heading', { name: 'Spot the change' })).toBeInTheDocument();
  });

  it('keeps inline math inside one answer choice copy wrapper', async () => {
    const user = userEvent.setup();
    const { container } = render(<LessonPlayer lesson={lessons[7]} />);

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
    render(<LessonPlayer lesson={starterLesson} onCorrectAnswer={onCorrectAnswer} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Show hint' }));

    expect(screen.getByRole('status')).toHaveTextContent(/Look only at the two/);

    await user.click(getRadioByValue('four'));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Correct\. The output changed by/);
    expect(screen.getByRole('alert').querySelector('.katex')).toBeInTheDocument();
    expect(onCorrectAnswer).toHaveBeenCalledWith('table-change');
    expect(onCorrectAnswer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Submit answer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show hint' })).toBeDisabled();
  });

  it('lets students retry after an incorrect answer', async () => {
    const user = userEvent.setup();
    const onCorrectAnswer = vi.fn();
    render(<LessonPlayer lesson={starterLesson} onCorrectAnswer={onCorrectAnswer} />);

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

  it('records one incorrect then one correct attempt for a wrong-then-right answer', async () => {
    const user = userEvent.setup();
    const onAttempt = vi.fn();
    const onCorrectAnswer = vi.fn();
    render(
      <LessonPlayer
        lesson={starterLesson}
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
    expect(onAttempt).toHaveBeenNthCalledWith(1, 'table-change', false);
    expect(onAttempt).toHaveBeenNthCalledWith(2, 'table-change', true);
    expect(onCorrectAnswer).toHaveBeenCalledTimes(1);
  });

  it('preserves an incorrect question state when navigating away and back', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={starterLesson} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Show hint' }));
    await user.click(getRadioByValue('one'));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(getRadioByValue('one')).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent(/Look only at the two/);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Not quite. Compare the ending output to the starting output, not the input values.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(getRadioByValue('one')).toBeDisabled();
    expect(getRadioByValue('four')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('preserves a correct question state when navigating away and back', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={starterLesson} />);

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

  it('restores saved lesson step and question progress', () => {
    render(
      <LessonPlayer
        initialProgress={{
          questionStates: {
            'table-change': {
              answerResult: 'incorrect',
              selectedOptionId: 'one',
              showHint: true,
            },
          },
          stepIndex: 1,
        }}
        lesson={starterLesson}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Spot the change' })).toBeInTheDocument();
    expect(screen.getByLabelText('What Changes? — lesson progress')).toHaveTextContent(
      'Step 2 of 7',
    );
    expect(getRadioByValue('one')).toBeChecked();
    expect(getRadioByValue('one')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/Look only at the two/);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('saves resume position while counting only completed steps for progress', async () => {
    const user = userEvent.setup();
    const onProgressChange = vi.fn();
    render(<LessonPlayer lesson={starterLesson} onProgressChange={onProgressChange} />);

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
          'table-change': {
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
          'table-change': {
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

  it('can finish and review a lesson', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={starterLesson} onComplete={() => award} />);

    await completeStarterLesson(user);

    expect(screen.getByRole('heading', { name: 'Nice work on What Changes?' })).toBeInTheDocument();
    expect(screen.getByLabelText('XP gained')).toHaveTextContent('+125 XP');
    expect(screen.getByText('5 questions answered: +100 XP')).toBeInTheDocument();
    expect(screen.getByText('Streak bonus: +25 XP')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Review lesson' }));

    expect(screen.getByRole('heading', { name: 'Functions describe change' })).toBeInTheDocument();
  });

  it('shows a next lesson link after completing a lesson when a next lesson exists', async () => {
    const user = userEvent.setup();
    renderWithRouter(<LessonPlayer lesson={starterLesson} nextLesson={lessons[1]} />);

    await completeStarterLesson(user);

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
        <LessonPlayer lesson={starterLesson} nextLesson={lessons[1]} onComplete={() => award} />
      </MemoryRouter>,
    );

    await completeStarterLesson(user);
    expect(screen.getByRole('heading', { name: 'Nice work on What Changes?' })).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <LessonPlayer lesson={lessons[1]} nextLesson={lessons[2]} onComplete={() => award} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Slope measures steepness' })).toBeInTheDocument();
    expect(screen.getByLabelText('Slope Refresher — lesson progress')).toHaveTextContent(
      'Step 1 of 7',
    );
    expect(screen.queryByRole('heading', { name: 'Nice work on Slope Refresher' })).not.toBeInTheDocument();
    expect(screen.queryByText('Already completed: no new XP')).not.toBeInTheDocument();
  });

  it('omits the next lesson link when there is no next lesson', async () => {
    const user = userEvent.setup();
    render(<LessonPlayer lesson={starterLesson} />);

    await completeStarterLesson(user);

    expect(screen.queryByRole('link', { name: /Next lesson/i })).not.toBeInTheDocument();
  });

  it('shows zero XP when a previously completed lesson is finished again', async () => {
    const user = userEvent.setup();
    render(
      <LessonPlayer
        lesson={starterLesson}
        onComplete={() => ({
          alreadyCompleted: true,
          dailyBonusXp: 0,
          lessonXp: 0,
          questionsAnswered: 5,
          totalXpGained: 0,
        })}
      />,
    );

    await completeStarterLesson(user);

    expect(screen.getByLabelText('XP gained')).toHaveTextContent('+0 XP');
    expect(screen.getByText('Already completed: no new XP')).toBeInTheDocument();
  });

  it('notifies when a lesson is completed', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn(() => award);
    render(<LessonPlayer lesson={starterLesson} onComplete={onComplete} />);

    await completeStarterLesson(user);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
