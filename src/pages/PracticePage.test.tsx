import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/AuthContext';
import { lessons } from '../data/lessons';
import { createSeededRng } from '../data/questionBank';
import { lessonProgressStorageKey } from '../lessons/lessonProgress';
import { PracticePage } from './PracticePage';

vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

beforeEach(() => {
  window.localStorage.clear();
  mockedUseAuth.mockReturnValue({
    user: null,
    loading: false,
    isConfigured: true,
    loginWithGoogle: vi.fn(),
    loginWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    logout: vi.fn(),
    deleteAccount: vi.fn(),
  });
  // Complete every lesson so all practice categories are unlocked and a session
  // has questions to draw from.
  window.localStorage.setItem(
    lessonProgressStorageKey,
    JSON.stringify({
      completedLessonIds: lessons.map((lesson) => lesson.id),
      dailyCompletionDates: [],
      totalXp: 0,
    }),
  );
});

function renderPractice() {
  return render(
    <MemoryRouter>
      <PracticePage rng={createSeededRng(7)} sessionSize={3} />
    </MemoryRouter>,
  );
}

describe('PracticePage', () => {
  it('shows the intro title page with a Next button before the questions', async () => {
    const user = userEvent.setup();
    renderPractice();

    expect(screen.getByRole('heading', { name: 'Random derivative practice' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Practice progress')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 1 of 3');
  });

  it('keeps the question and reveals the explanation after submitting, then advances', async () => {
    const user = userEvent.setup();
    renderPractice();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    const firstRadio = document.querySelector<HTMLInputElement>('input[type="radio"]');
    expect(firstRadio).not.toBeNull();
    await user.click(firstRadio as HTMLInputElement);
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));

    // Regression guard: awarding XP/streak on submit must NOT reset the session.
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 1 of 3');
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Next random question|View summary/ }));
    expect(screen.getByLabelText('Practice progress')).toHaveTextContent('Question 2 of 3');
  });
});
