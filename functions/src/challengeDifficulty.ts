// Adaptive difficulty for the AI challenge round.
//
// Difficulty is a CONTINUOUS spectrum driven by the learner's accuracy on the
// session questions: higher accuracy ⇒ a higher target, smoothly interpolated.
//
// Kept in its OWN module with NO Firebase/OpenAI imports so it can be unit-tested
// from the app's test runner (./index pulls in heavy server-only deps).

// Accuracy window mapped onto the difficulty scale: at/below EASY_ANCHOR the
// target sits at the easy end (sub-50% is effectively failing, inflated by MC
// guessing), at/above HARD_ANCHOR at the hard end, ramping linearly between.
export const CHALLENGE_DIFFICULTY_EASY_ANCHOR = 0.5;
export const CHALLENGE_DIFFICULTY_HARD_ANCHOR = 0.9;
// Difficulty target scale: 0 (easiest) .. CHALLENGE_DIFFICULTY_MAX_SCORE (hardest).
export const CHALLENGE_DIFFICULTY_MAX_SCORE = 10;

/**
 * Maps a 0..1 session-accuracy ratio to a continuous difficulty target in
 * [0, CHALLENGE_DIFFICULTY_MAX_SCORE], rounded to one decimal. Clamped to 0
 * at/below the EASY anchor and to the max at/above the HARD anchor; non-finite
 * input is treated as 0.
 *
 *   score = clamp((accuracy − 0.50) / (0.90 − 0.50), 0, 1) × 10
 */
export function challengeDifficultyScore(accuracy: number): number {
  const safe = Number.isFinite(accuracy) ? Math.min(1, Math.max(0, accuracy)) : 0;
  const span = CHALLENGE_DIFFICULTY_HARD_ANCHOR - CHALLENGE_DIFFICULTY_EASY_ANCHOR;
  const ratio = Math.min(1, Math.max(0, (safe - CHALLENGE_DIFFICULTY_EASY_ANCHOR) / span));
  return Math.round(ratio * CHALLENGE_DIFFICULTY_MAX_SCORE * 10) / 10;
}

/**
 * Natural-language difficulty directive for the generation prompt (e.g. "Target
 * difficulty: 6.8/10 …"). The numeric score is the driving signal; the prose
 * just explains the scale so the model can calibrate to that level.
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
