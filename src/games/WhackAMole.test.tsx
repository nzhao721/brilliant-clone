import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The shared sound engine is finalized in parallel; stub it so the game renders
// without a SoundProvider in the tree and every audio call is an inert no-op.
vi.mock('../audio/SoundProvider', () => ({
  useSound: () => ({
    playEffect: () => {},
    playCustom: () => {},
    startMusic: () => {},
    stopMusic: () => {},
    isMuted: false,
    toggleMute: () => {},
    volume: 1,
    setVolume: () => {},
  }),
}));

import {
  HOLE_BOUNDS,
  HOLE_COUNT,
  HOLE_SIZE_PCT,
  WhackAMole,
  scatterHoles,
  type HolePosition,
} from './WhackAMole';

afterEach(cleanup);

// Deterministic PRNG (mulberry32) so the scatter assertions are reproducible and
// never flake, while still exercising many distinct random layouts.
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function minPairDistance(points: HolePosition[]): number {
  let min = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      if (d < min) min = d;
    }
  }
  return min;
}

function readHolePositions(container: HTMLElement): HolePosition[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button.wam-hole')).map(
    (hole) => ({ x: Number.parseFloat(hole.style.left), y: Number.parseFloat(hole.style.top) }),
  );
}

describe('WhackAMole', () => {
  it('mounts inactive with 9 disabled, empty holes and no game over', () => {
    const onScoreChange = vi.fn();
    const onGameOver = vi.fn();
    const { container } = render(
      <WhackAMole active={false} onScoreChange={onScoreChange} onGameOver={onGameOver} />,
    );

    const holes = container.querySelectorAll('button.wam-hole');
    expect(holes).toHaveLength(9);
    holes.forEach((hole) => expect(hole).toBeDisabled());
    expect(container.querySelector('[data-mole="up"]')).toBeNull();
    expect(onGameOver).not.toHaveBeenCalled();
  });

  it('starts a fresh session and scores when a visible mole is bonked', () => {
    const onScoreChange = vi.fn();
    const { container } = render(
      <WhackAMole active onScoreChange={onScoreChange} onGameOver={vi.fn()} />,
    );

    // A new session resets the reported score and pops the first mole immediately.
    expect(onScoreChange).toHaveBeenCalledWith(0);
    const mole = container.querySelector('button[data-mole="up"]') as HTMLButtonElement | null;
    expect(mole).not.toBeNull();

    fireEvent.click(mole!);
    expect(onScoreChange).toHaveBeenLastCalledWith(1);
    // The bonked mole is no longer whackable.
    expect(mole!.getAttribute('data-mole')).toBe('bonk');
  });

  it('bonks a visible mole from a number key on window (no hole focus needed)', () => {
    const onScoreChange = vi.fn();
    const { container } = render(
      <WhackAMole active onScoreChange={onScoreChange} onGameOver={vi.fn()} />,
    );

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button.wam-hole'),
    );
    const upIndex = buttons.findIndex((b) => b.getAttribute('data-mole') === 'up');
    expect(upIndex).toBeGreaterThanOrEqual(0);

    // Dispatch on window — an element-scoped board handler could never catch this,
    // so a score here proves number-key play works without focusing a hole first.
    fireEvent.keyDown(window, { key: String(upIndex + 1) });

    expect(onScoreChange).toHaveBeenLastCalledWith(1);
    expect(buttons[upIndex].getAttribute('data-mole')).toBe('bonk');
  });

  it('clears the board when active turns false (cleanup)', () => {
    const { container, rerender } = render(
      <WhackAMole active onScoreChange={vi.fn()} onGameOver={vi.fn()} />,
    );
    expect(container.querySelector('[data-mole="up"]')).not.toBeNull();

    rerender(<WhackAMole active={false} onScoreChange={vi.fn()} onGameOver={vi.fn()} />);
    expect(container.querySelector('[data-mole="up"]')).toBeNull();
  });

  it('scatters the expected number of in-bounds, non-overlapping holes', () => {
    // Many deterministic seeds give broad coverage of random layouts without flake.
    for (let seed = 1; seed <= 40; seed += 1) {
      const holes = scatterHoles(makeRng(seed));

      expect(holes).toHaveLength(HOLE_COUNT);

      // Every hole center stays within the in-bounds region (radius + HUD reserve).
      holes.forEach(({ x, y }) => {
        expect(x).toBeGreaterThanOrEqual(HOLE_BOUNDS.minX);
        expect(x).toBeLessThanOrEqual(HOLE_BOUNDS.maxX);
        expect(y).toBeGreaterThanOrEqual(HOLE_BOUNDS.minY);
        expect(y).toBeLessThanOrEqual(HOLE_BOUNDS.maxY);
      });

      // Centers at least one diameter apart ⇒ holes never overlap or touch.
      expect(minPairDistance(holes)).toBeGreaterThanOrEqual(HOLE_SIZE_PCT);
    }
  });

  it('positions the rendered holes by the scattered layout (not a grid)', () => {
    const { container } = render(
      <WhackAMole active onScoreChange={vi.fn()} onGameOver={vi.fn()} />,
    );

    const positions = readHolePositions(container);
    expect(positions).toHaveLength(HOLE_COUNT);

    positions.forEach(({ x, y }) => {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      // Fully inside the board once the hole radius is accounted for (no clipping).
      expect(x).toBeGreaterThanOrEqual(HOLE_SIZE_PCT / 2);
      expect(x).toBeLessThanOrEqual(100 - HOLE_SIZE_PCT / 2);
      expect(y).toBeGreaterThanOrEqual(HOLE_SIZE_PCT / 2);
      expect(y).toBeLessThanOrEqual(100 - HOLE_SIZE_PCT / 2);
    });

    // The actual rendered holes are spread out, not packed into a grid.
    expect(minPairDistance(positions)).toBeGreaterThanOrEqual(HOLE_SIZE_PCT);
  });
});
