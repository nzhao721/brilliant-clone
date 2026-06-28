import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

/* jsdom has no matchMedia, so the component defaults to the winding layout. These
   tests stub matchMedia to drive the narrow-screen branch and assert the trail
   collapses to a left-aligned number+title list with no winding offsets. */
describe('TrailMap narrow (left-aligned list) layout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockMatchMedia(matches: boolean) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches, addEventListener() {}, removeEventListener() {} }),
    );
  }

  function renderNarrowTrail() {
    return render(
      <MemoryRouter>
        <TrailMap nodes={nodes} />
      </MemoryRouter>,
    );
  }

  it('drops the winding offsets/connector and renders numbers-left + pills-right', () => {
    mockMatchMedia(true);
    const { container } = renderNarrowTrail();

    // The trail switches into the narrow list mode…
    expect(container.querySelector('.trail')).toHaveClass('trail-narrow');
    // …and the winding SVG connector is gone.
    expect(container.querySelector('svg.trail-line')).toBeNull();

    // No per-stop winding offsets (inline left/top) or alternating label sides remain.
    const stops = Array.from(container.querySelectorAll<HTMLElement>('.trail-stop'));
    expect(stops).toHaveLength(nodes.length);
    for (const stop of stops) {
      expect(stop.style.left).toBe('');
      expect(stop.style.top).toBe('');
      expect(stop.className).not.toMatch(/trail-label-(left|right)/);
      // The number marker comes first, with its title pill immediately after it.
      expect(stop.firstElementChild?.className).toContain('trail-marker');
    }

    // Every lesson number is present, each paired with its title pill.
    expect(
      Array.from(container.querySelectorAll('.trail-marker-number')).map((n) => n.textContent),
    ).toEqual(['1', '2', '3']);
    expect(
      Array.from(container.querySelectorAll('.trail-label-title')).map((t) => t.textContent),
    ).toEqual(['Completed Lesson', 'Available Lesson', 'Locked Lesson']);

    // Navigation is preserved: reachable lessons stay links.
    expect(container.querySelector('a[href="/lessons/done"]')).not.toBeNull();
    expect(container.querySelector('a[href="/lessons/todo"]')).not.toBeNull();
  });

  it('keeps the winding layout (offsets + connector) on wide screens', () => {
    mockMatchMedia(false);
    const { container } = renderNarrowTrail();

    expect(container.querySelector('.trail')).not.toHaveClass('trail-narrow');
    // The winding SVG connector renders…
    expect(container.querySelector('svg.trail-line')).not.toBeNull();
    // …and each stop carries its inline winding offset + a label side.
    const stops = Array.from(container.querySelectorAll<HTMLElement>('.trail-stop'));
    for (const stop of stops) {
      expect(stop.style.left).not.toBe('');
      expect(stop.style.top).not.toBe('');
      expect(stop.className).toMatch(/trail-label-(left|right)/);
    }
  });
});
