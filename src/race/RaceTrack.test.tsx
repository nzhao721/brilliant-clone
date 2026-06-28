import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  carTransform,
  MIN_VISIBLE_WINDOW,
  RaceTrack,
  type RaceTrackOpponent,
  visibleWindowMeters,
} from './RaceTrack';

/* RaceTrack is purely presentational, so it renders standalone. These tests lock in the N-opponent HUD: ranked standings, one minimap marker per racer, distinct opponent colours, per-racer finish flags. */

function opponent(overrides: Partial<RaceTrackOpponent> & { id: string }): RaceTrackOpponent {
  return {
    name: overrides.id,
    color: '#ff5a4d',
    position: 0,
    velocity: 0,
    finished: false,
    ...overrides,
  };
}

function renderTrack(opponents: RaceTrackOpponent[], playerPosition = 50) {
  return render(
    <RaceTrack
      seed={7}
      raceDistance={2500}
      player={{ position: playerPosition, velocity: 0, fuel: 0 }}
      playerName="You"
      playerColor="#11815a"
      opponents={opponents}
    />,
  );
}

describe('RaceTrack with N opponents', () => {
  it('renders a standings row per racer, ranked by distance covered', () => {
    const { container } = renderTrack([
      opponent({ id: 'Alpha', name: 'Alpha', position: 100, color: '#ff5a4d' }),
      opponent({ id: 'Bravo', name: 'Bravo', position: 300, color: '#0ea5e9' }),
      opponent({ id: 'Charlie', name: 'Charlie', position: 200, color: '#8b5cf6' }),
    ]);

    const rows = container.querySelectorAll('.race-standing');
    // One row per racer (3 opponents + the player).
    expect(rows).toHaveLength(4);
    // Ranked leader-first by position: Bravo(300) > Charlie(200) > Alpha(100) > You(50).
    expect(rows[0].textContent).toContain('Bravo');
    expect(rows[1].textContent).toContain('Charlie');
    expect(rows[2].textContent).toContain('Alpha');
    expect(rows[3].textContent).toContain('You');
    // The trailing row is the player's own row.
    expect(rows[3]).toHaveClass('race-standing-player');
    expect(container.querySelectorAll('.race-standing-opponent')).toHaveLength(3);
  });

  it('gives each opponent a distinct colour on its standings dot', () => {
    const { container } = renderTrack([
      opponent({ id: 'a', position: 100, color: '#ff5a4d' }),
      opponent({ id: 'b', position: 200, color: '#0ea5e9' }),
      opponent({ id: 'c', position: 300, color: '#8b5cf6' }),
    ]);

    const dots = Array.from(
      container.querySelectorAll<HTMLElement>('.race-standing-opponent .race-standing-dot'),
    );
    expect(dots).toHaveLength(3);
    const colors = new Set(dots.map((dot) => dot.style.background));
    expect(colors.size).toBe(3);
  });

  it('renders one minimap marker per opponent plus the player', () => {
    const { container } = renderTrack([
      opponent({ id: 'a', position: 100 }),
      opponent({ id: 'b', position: 200 }),
      opponent({ id: 'c', position: 300 }),
    ]);

    expect(container.querySelectorAll('.race-minimap-opponent')).toHaveLength(3);
    expect(container.querySelectorAll('.race-minimap-player')).toHaveLength(1);
  });

  it('flags a finished opponent in the standings', () => {
    const { container } = renderTrack([
      opponent({ id: 'Winner', name: 'Winner', position: 2500, finished: true }),
      opponent({ id: 'Slow', name: 'Slow', position: 400, finished: false }),
    ]);

    const winnerRow = Array.from(container.querySelectorAll('.race-standing')).find((row) =>
      row.textContent?.includes('Winner'),
    );
    expect(winnerRow?.textContent).toContain('Finished');
  });
});

/* Pure helper for the responsive viewport-scale fix: how many metres of track are shown
   across the canvas width. Desktop/landscape keeps the base window; mobile portrait narrows
   it so hills aren't over-steepened and cars keep natural proportions. */
describe('visibleWindowMeters (responsive visible span)', () => {
  const BASE = 100;
  const DISTANCE = 2500;

  it('keeps the full base window on an undistorted/landscape canvas (aspect ≤ 1) — desktop stays ~100m', () => {
    expect(visibleWindowMeters(BASE, DISTANCE, 1)).toBe(100);
    // A wide (landscape) canvas is never widened beyond the base window.
    expect(visibleWindowMeters(BASE, DISTANCE, 0.5)).toBe(100);
  });

  it('narrows below 100m on a tall/narrow (portrait) canvas, scaling by 1/aspect', () => {
    // aspect 2 (vertically stretched) → 100 / 2 = 50m, still at/above the floor.
    const narrowed = visibleWindowMeters(BASE, DISTANCE, 2);
    expect(narrowed).toBeLessThan(100);
    expect(narrowed).toBe(50);
  });

  it('floors very tall/narrow canvases at MIN_VISIBLE_WINDOW so it never over-zooms', () => {
    // aspect 4 → 100 / 4 = 25m, clamped up to the floor.
    expect(visibleWindowMeters(BASE, DISTANCE, 4)).toBe(MIN_VISIBLE_WINDOW);
  });

  it('never shows more than the whole track', () => {
    expect(visibleWindowMeters(BASE, 30, 1)).toBe(30);
  });

  it('falls back to the base window for a degenerate (zero/negative) aspect', () => {
    expect(visibleWindowMeters(BASE, DISTANCE, 0)).toBe(100);
  });
});

/* Car placement transform. `preserveAspectRatio="none"` stretches the viewBox by S = diag(sx, sy);
   the on-screen car = S · M where M is carTransform's matrix. An SVG `matrix(a b c d e f)` is the
   linear map [[a, c], [b, d]], so the net glyph→pixel scale is [[sx·a, sx·c], [sy·b, sy·d]]. The car
   must end up UNIFORMLY scaled (no horizontal squish) by sy (a readable size, NOT the tiny sx). */
function carMatrix(transform: string): { a: number; b: number; c: number; d: number } {
  const match = transform.match(/matrix\(([^)]+)\)/);
  if (!match) throw new Error(`no matrix() in transform: ${transform}`);
  const [a, b, c, d] = match[1].trim().split(/\s+/).map(Number);
  return { a, b, c, d };
}

function netCarScale(transform: string, sx: number, sy: number) {
  const { a, b, c, d } = carMatrix(transform);
  return { xx: sx * a, xy: sx * c, yx: sy * b, yy: sy * d };
}

describe('carTransform (car scaling + tilt)', () => {
  /* Matrix coeffs are rounded to 4 dp in the transform string, so compare to 3 dp — far tighter
     than any squish (≈4×) or shrink (≈4×) would ever be, but immune to that rounding. */
  const PRECISION = 3;

  it('scales the car uniformly by sy on a tall/narrow canvas — readable, not tiny, not squished', () => {
    // Portrait phone: vertical pixel scale dwarfs horizontal → aspect k = sy/sx = 4.
    const sx = 0.4;
    const sy = 1.6;
    const k = sy / sx;
    // Flat ground (slope 0) isolates the scale from the tilt.
    const net = netCarScale(carTransform(500, 280, 0, k, 0.05), sx, sy);

    // Uniform → natural aspect preserved (no horizontal squish) and no shear.
    expect(net.xx).toBeCloseTo(net.yy, PRECISION);
    expect(net.xy).toBeCloseTo(0, PRECISION);
    expect(net.yx).toBeCloseTo(0, PRECISION);
    // …and the uniform scale is sy (the readable size), NOT sx (the regression that made it tiny).
    expect(net.xx).toBeCloseTo(sy, PRECISION);
    expect(net.xx).not.toBeCloseTo(sx, 1);
  });

  it('leaves the desktop car effectively unchanged (aspect ≈ 1 → uniform pixel-scale)', () => {
    const sx = 1.92;
    const sy = 1.93; // ≈16:9 → k ≈ 1.005
    const k = sy / sx;
    const net = netCarScale(carTransform(500, 280, 0, k, 0.1), sx, sy);
    expect(net.xx).toBeCloseTo(net.yy, PRECISION);
    expect(net.xx).toBeCloseTo(sy, PRECISION);
  });

  it('tilts rigidly (sy·R) tangent to the slope — a uniform-scaled rotation, never a shear', () => {
    const sx = 0.4;
    const sy = 1.6;
    const k = sy / sx;
    // A non-zero world slope tilts the car.
    const net = netCarScale(carTransform(500, 280, 0.6, k, 0.1), sx, sy);

    // sy·R: equal diagonal, opposite off-diagonal, and both basis vectors have magnitude sy.
    expect(net.xx).toBeCloseTo(net.yy, PRECISION);
    expect(net.xy).toBeCloseTo(-net.yx, PRECISION);
    expect(Math.hypot(net.xx, net.yx)).toBeCloseTo(sy, PRECISION);
    expect(Math.hypot(net.xy, net.yy)).toBeCloseTo(sy, PRECISION);
    // It actually tilted (non-zero off-diagonal), so the car sits tangent to the hill.
    expect(Math.abs(net.yx)).toBeGreaterThan(0.01);
  });
});
