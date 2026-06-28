/*
 * The DAILY-REQUIRED mixed-practice gate. Once a learner has completed at least
 * one lesson, they must pass an 85% mixed-practice set each day before the rest of
 * the app (lessons, games, race, dashboard, analytics) unlocks for that day.
 *
 * Pure predicates over LessonProgress + a `today` date key (YYYY-MM-DD, from
 * getTodayKey so the test-day offset applies).
 */

import type { LessonProgress } from './lessonProgress';

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
