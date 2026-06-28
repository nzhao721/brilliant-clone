/*
 * The DAILY-REQUIRED mixed-practice gate. Once a learner has completed at least
 * one lesson, they must pass an 85% mixed-practice set each day before the rest of
 * the app (lessons, games, race, dashboard, analytics) unlocks for that day.
 *
 * Pure predicates over LessonProgress + a `today` date key (YYYY-MM-DD, from
 * getTodayKey so the test-day offset applies).
 */

import type { LessonProgress } from './lessonProgress';

/*
 * MASTER SWITCH for ENFORCING the daily-required practice gate.
 *
 * `true` (current): once a learner has completed a lesson, DailyGateRoute redirects
 * gated routes to /practice, /practice opens in gateMode with the curated required
 * set (weak + SR + coverage), and the "finish required practice" banners show until
 * today's 85% pass. `false`: fully disabled — every route renders normally, /practice
 * is plain FREE practice, and the banners stay hidden.
 *
 * The pure predicates below (and the SR + practice-selection modules) are independent
 * of this flag; it is consulted ONLY at the enforcement points (each combined with
 * isDailyGateActive). Typed `boolean` (not a literal) so those conjunctions stay
 * `boolean` and tests can override it via a module mock.
 */
export const DAILY_GATE_ENABLED: boolean = true;

/**
 * Label shown on lesson/game LAUNCH controls that are GRAYED OUT while the daily
 * gate is active — the dashboard trail stops + "next up" CTA and the arcade play
 * buttons. Under the current model those LIST pages still render (they are not
 * redirected); only the actual lesson/game-play/race routes hard-redirect to
 * /practice. The disabled controls carry this label so the learner knows how to
 * unlock them.
 */
export const DAILY_GATE_LOCK_LABEL = 'Complete daily practice to unlock';

/** Whether the learner has already passed today's required practice. */
export function isTodayPracticePassed(progress: LessonProgress, today: string): boolean {
  return (progress.requiredPracticePassedDates ?? []).includes(today);
}

/**
 * Whether the daily gate is active right now: the learner has completed >= 1
 * lesson AND has not yet passed today's required practice. A brand-new learner
 * (0 completed lessons) is never gated, so the first lesson is always reachable.
 */
export function isDailyGateActive(progress: LessonProgress, today: string): boolean {
  return (progress.completedLessonIds?.length ?? 0) >= 1 && !isTodayPracticePassed(progress, today);
}
