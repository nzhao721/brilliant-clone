// Adaptive difficulty for the AI challenge round.
//
// Difficulty is a CONTINUOUS spectrum driven by the learner's accuracy on the
// session questions the generator receives (the first N-1 answers, since the
// orchestrator excludes the last static question). Higher accuracy ⇒ a higher
// difficulty target, smoothly interpolated — NOT snapped to a few discrete bands.
//
// Kept in its OWN module with NO Firebase/OpenAI imports so it can be unit-tested
// directly from the app's test runner (the generate function in ./index pulls in
// heavy server-only deps and can't be imported there).

// The accuracy window mapped onto the difficulty scale. At/below EASY_ANCHOR the
// target sits at the easy end (sub-50% is effectively failing, and multiple-choice
// guessing inflates raw scores so true mastery is lower); at/above HARD_ANCHOR it
// sits at the hard end; between them it ramps linearly.
export const CHALLENGE_DIFFICULTY_EASY_ANCHOR = 0.5;
export const CHALLENGE_DIFFICULTY_HARD_ANCHOR = 0.9;
// Difficulty target scale: 0 (easiest) .. CHALLENGE_DIFFICULTY_MAX_SCORE (hardest).
export const CHALLENGE_DIFFICULTY_MAX_SCORE = 10;

/**
 * Maps a 0..1 session-accuracy ratio to a CONTINUOUS difficulty target in
 * [0, CHALLENGE_DIFFICULTY_MAX_SCORE], rounded to one decimal place.
 * Monotonically non-decreasing: clamped to the easy end (0) at/below the EASY
 * anchor (≈0.50), to the hard end (max) at/above the HARD anchor (≈0.90), and
 * linearly interpolated between. Non-finite input is treated as 0 (easiest).
 *
 *   score = clamp((accuracy − 0.50) / (0.90 − 0.50), 0, 1) × 10
 */
export function challengeDifficultyScore(accuracy: number): number {
  const safe = Number.isFinite(accuracy) ? Math.min(1, Math.max(0, accuracy)) : 0;
  const span = CHALLENGE_DIFFICULTY_HARD_ANCHOR - CHALLENGE_DIFFICULTY_EASY_ANCHOR;
  const ratio = Math.min(1, Math.max(0, (safe - CHALLENGE_DIFFICULTY_EASY_ANCHOR) / span));
  // One-decimal precision keeps the target fine-grained without spurious noise.
  return Math.round(ratio * CHALLENGE_DIFFICULTY_MAX_SCORE * 10) / 10;
}

/**
 * A concise natural-language difficulty directive for the generation prompt that
 * conveys the CONTINUOUS target (e.g. "Target difficulty: 6.8/10 …"). The numeric
 * score is the single driving signal; the surrounding text just explains the
 * scale so the model can calibrate each question to that exact level.
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
