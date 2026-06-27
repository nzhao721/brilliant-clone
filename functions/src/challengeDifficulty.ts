/*
 * Adaptive difficulty for the AI challenge round: a CONTINUOUS target driven by
 * the learner's session accuracy (higher accuracy ⇒ higher target). Kept in its
 * OWN module with NO Firebase/OpenAI imports so it's unit-testable from the app's
 * test runner.
 */

/* Accuracy window mapped onto the scale: at/below EASY_ANCHOR → easy end (sub-50%
 * is failing, inflated by MC guessing), at/above HARD_ANCHOR → hard end, linear
 * between. */
export const CHALLENGE_DIFFICULTY_EASY_ANCHOR = 0.5;
export const CHALLENGE_DIFFICULTY_HARD_ANCHOR = 0.9;
// Difficulty target scale: 0 (easiest) .. CHALLENGE_DIFFICULTY_MAX_SCORE (hardest).
export const CHALLENGE_DIFFICULTY_MAX_SCORE = 10;

/**
 * Maps a 0..1 accuracy ratio to a difficulty target in [0, MAX_SCORE], rounded to
 * one decimal; clamped to 0 at/below EASY and max at/above HARD (non-finite → 0).
 *   score = clamp((accuracy − 0.50) / (0.90 − 0.50), 0, 1) × 10
 */
export function challengeDifficultyScore(accuracy: number): number {
  const safe = Number.isFinite(accuracy) ? Math.min(1, Math.max(0, accuracy)) : 0;
  const span = CHALLENGE_DIFFICULTY_HARD_ANCHOR - CHALLENGE_DIFFICULTY_EASY_ANCHOR;
  const ratio = Math.min(1, Math.max(0, (safe - CHALLENGE_DIFFICULTY_EASY_ANCHOR) / span));
  return Math.round(ratio * CHALLENGE_DIFFICULTY_MAX_SCORE * 10) / 10;
}

/**
 * Natural-language difficulty directive for the prompt (e.g. "Target difficulty:
 * 6.8/10 …"). The numeric score drives it; the prose just explains the scale.
 */
export function challengeDifficultyDirective(accuracy: number): string {
  const score = challengeDifficultyScore(accuracy);
  const max = CHALLENGE_DIFFICULTY_MAX_SCORE;
  return (
    `Target difficulty: ${score.toFixed(1)}/${max} on a CONTINUOUS scale where ` +
    '0 = the easiest single-step, confidence-building questions (clearly-wrong ' +
    `distractors, no traps) and ${max} = the hardest multi-step questions (subtle, ` +
    'highly plausible distractors reflecting deep misconceptions). Calibrate EVERY ' +
    `question precisely to this ${score.toFixed(1)}/${max} level — proportionally ` +
    'easier the lower it is and harder the higher it is — while keeping each ' +
    'question fair, self-contained, and unambiguous.'
  );
}
