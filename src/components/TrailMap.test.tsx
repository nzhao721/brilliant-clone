import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TrailMap, type TrailMapNode } from './TrailMap';

/* A completed lesson (reviewable), an available-but-incomplete lesson (the gate
   target), and a still-locked lesson (never interactive). */
const nodes: TrailMapNode[] = [
  {
    id: 'done',
    title: 'Completed Lesson',
    status: 'complete',
    sequenceNumber: 1,
    progressPercent: 100,
    hasSavedProgress: false,
  },
  {
    id: 'todo',
    title: 'Available Lesson',
    status: 'available',
    sequenceNumber: 2,
    progressPercent: 40,
    hasSavedProgress: true,
  },
  {
    id: 'later',
    title: 'Locked Lesson',
    status: 'locked',
    sequenceNumber: 3,
    lockedReason: 'Complete Lesson 2 first.',
    progressPercent: 0,
    hasSavedProgress: false,
  },
];

function renderTrail(locked: boolean) {
  return render(
    <MemoryRouter>
      <TrailMap nodes={nodes} locked={locked} />
    </MemoryRouter>,
  );
}

describe('TrailMap daily gate', () => {
  it('keeps COMPLETED stops clickable and grays out INCOMPLETE stops while gated', () => {
    const { container } = renderTrail(true);

    // A completed lesson stays a live link so it can be reviewed during the gate.
    expect(container.querySelector('a[href="/lessons/done"]')).not.toBeNull();

    // The not-yet-completed (available) lesson is NOT a link…
    expect(container.querySelector('a[href="/lessons/todo"]')).toBeNull();
    // …it's a DISABLED button labeled with the shared lock copy.
    const lockedButton = screen.getByRole('button', {
      name: 'Complete daily practice to unlock',
    });
    expect(lockedButton).toBeDisabled();

    // The genuinely locked lesson is neither a link nor a gate button.
    expect(container.querySelector('a[href="/lessons/later"]')).toBeNull();
    expect(
      screen.getAllByRole('button', { name: 'Complete daily practice to unlock' }),
    ).toHaveLength(1);
  });

  it('links every reachable stop and shows no lock buttons when not gated', () => {
    const { container } = renderTrail(false);

    expect(container.querySelector('a[href="/lessons/done"]')).not.toBeNull();
    expect(container.querySelector('a[href="/lessons/todo"]')).not.toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Complete daily practice to unlock' }),
    ).not.toBeInTheDocument();
  });
});
