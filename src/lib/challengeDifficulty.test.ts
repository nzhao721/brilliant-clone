import { describe, expect, it } from 'vitest';
/* The adaptive-difficulty helper lives in the Cloud Functions package but is a
 * dependency-free pure module, so the app's test runner imports it directly. */
import {
  CHALLENGE_DIFFICULTY_EASY_ANCHOR,
  CHALLENGE_DIFFICULTY_HARD_ANCHOR,
  CHALLENGE_DIFFICULTY_MAX_SCORE,
  challengeDifficultyDirective,
  challengeDifficultyScore,
} from '../../functions/src/challengeDifficulty';

describe('challengeDifficultyScore (continuous spectrum)', () => {
  it('clamps to the EASY end (0) at/below the ~0.50 accuracy anchor', () => {
    expect(challengeDifficultyScore(CHALLENGE_DIFFICULTY_EASY_ANCHOR)).toBe(0);
    expect(challengeDifficultyScore(0.5)).toBe(0);
    expect(challengeDifficultyScore(0.45)).toBe(0);
    expect(challengeDifficultyScore(0.2)).toBe(0);
  });

  it('clamps to the HARD end (max) at/above the ~0.90 accuracy anchor', () => {
    expect(challengeDifficultyScore(CHALLENGE_DIFFICULTY_HARD_ANCHOR)).toBe(
      CHALLENGE_DIFFICULTY_MAX_SCORE,
    );
    expect(challengeDifficultyScore(0.9)).toBe(CHALLENGE_DIFFICULTY_MAX_SCORE);
    expect(challengeDifficultyScore(0.95)).toBe(CHALLENGE_DIFFICULTY_MAX_SCORE);
    expect(challengeDifficultyScore(1)).toBe(CHALLENGE_DIFFICULTY_MAX_SCORE);
  });

  it('interpolates smoothly between the anchors with strictly increasing distinct values', () => {
    const a = challengeDifficultyScore(0.6);
    const b = challengeDifficultyScore(0.7);
    const c = challengeDifficultyScore(0.8);

    // Strictly increasing and all distinct (not snapped to a few buckets).
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    // Strictly inside the clamps, with one-decimal precision.
    expect(a).toBeGreaterThan(0);
    expect(c).toBeLessThan(CHALLENGE_DIFFICULTY_MAX_SCORE);
    // Linear ramp on the 0..10 scale: 0.6→2.5, 0.7→5.0, 0.8→7.5.
    expect(a).toBeCloseTo(2.5, 5);
    expect(b).toBeCloseTo(5.0, 5);
    expect(c).toBeCloseTo(7.5, 5);
  });

  it('is monotonic non-decreasing across the whole 0..1 accuracy range', () => {
    let previous = -1;
    for (let pct = 0; pct <= 100; pct += 1) {
      const score = challengeDifficultyScore(pct / 100);
      expect(score).toBeGreaterThanOrEqual(previous);
      previous = score;
    }
  });

  it('handles extremes and junk input (non-finite / out-of-range → clamped)', () => {
    expect(challengeDifficultyScore(0)).toBe(0);
    expect(challengeDifficultyScore(1)).toBe(CHALLENGE_DIFFICULTY_MAX_SCORE);
    expect(challengeDifficultyScore(Number.NaN)).toBe(0);
    expect(challengeDifficultyScore(-5)).toBe(0);
    expect(challengeDifficultyScore(5)).toBe(CHALLENGE_DIFFICULTY_MAX_SCORE);
  });
});

describe('challengeDifficultyDirective', () => {
  it('embeds the continuous numeric target (one-decimal) and explains the scale', () => {
    const directive = challengeDifficultyDirective(0.7);
    expect(directive).toMatch(/5\.0\/10/);
    expect(directive).toMatch(/continuous scale/i);
  });

  it('reads at the easy end for failing accuracy and the hard end for top accuracy', () => {
    expect(challengeDifficultyDirective(0.4)).toMatch(/0\.0\/10/);
    expect(challengeDifficultyDirective(0.95)).toMatch(/10\.0\/10/);
  });
});
