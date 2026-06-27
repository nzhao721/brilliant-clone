import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

import { BASE_SPEED, MAX_SPEED, SPEED_STEP, StackTower, speedForScore } from './StackTower';

// Speed values the game shipped with before it was eased off a notch. Kept here
// so the assertions document the intended slowdown rather than a magic number.
const PREV_BASE_SPEED = 120;
const PREV_SPEED_STEP = 8;
const PREV_MAX_SPEED = 430;
const prevSpeedForScore = (score: number) => Math.min(PREV_MAX_SPEED, PREV_BASE_SPEED + score * PREV_SPEED_STEP);

describe('StackTower', () => {
  it('mounts in the idle (inactive) state', () => {
    render(<StackTower active={false} onScoreChange={vi.fn()} onGameOver={vi.fn()} />);
    expect(screen.getByRole('application', { name: /stack/i })).toBeInTheDocument();
  });

  it('mounts when active and tolerates input without crashing', () => {
    render(<StackTower active onScoreChange={vi.fn()} onGameOver={vi.fn()} />);
    const area = screen.getByRole('application', { name: /stack/i });
    fireEvent.pointerDown(area);
    fireEvent.keyDown(window, { code: 'Space' });
    expect(area).toBeInTheDocument();
  });

  describe('speed tuning', () => {
    it('starts slower than the previous base speed, but only modestly', () => {
      expect(BASE_SPEED).toBeLessThan(PREV_BASE_SPEED);
      // A "little bit" slower: roughly a 15-20% reduction, not a drastic drop.
      expect(BASE_SPEED).toBeGreaterThanOrEqual(PREV_BASE_SPEED * 0.8);
      expect(BASE_SPEED).toBeLessThanOrEqual(PREV_BASE_SPEED * 0.85);
      expect(speedForScore(0)).toBe(BASE_SPEED);
    });

    it('keeps a progressive ramp that speeds up as the tower grows', () => {
      expect(SPEED_STEP).toBeGreaterThan(0);
      expect(speedForScore(1)).toBeGreaterThan(speedForScore(0));
      expect(speedForScore(10)).toBeGreaterThan(speedForScore(5));
    });

    it('ramps more gently than before at every level', () => {
      expect(SPEED_STEP).toBeLessThan(PREV_SPEED_STEP);
      for (const score of [0, 1, 5, 10, 20, 40, 80]) {
        expect(speedForScore(score)).toBeLessThan(prevSpeedForScore(score));
      }
    });

    it('caps the speed below the previous maximum', () => {
      expect(MAX_SPEED).toBeLessThan(PREV_MAX_SPEED);
      expect(speedForScore(10_000)).toBe(MAX_SPEED);
    });
  });
});
