/*
 * Spaced-repetition scheduling for completed lessons (the "topic" granularity used
 * across progress). A lesson's review schedule is anchored on its first-completion
 * timestamp (lessonCompletedAt) and advances through SR_INTERVALS as the learner
 * passes the daily-required practice gate that serves it.
 *
 * Pure + dependency-light (only the calendar-day helpers + a type-only import of
 * LessonProgress), so it is unit-testable in isolation and free of import cycles.
 */

import { dateKeyToDayNumber, dayNumberToDateKey, isoToLocalDateKey } from './dayMath';
import type { LessonProgress } from './lessonProgress';

/* Days-after-completion at which a topic becomes due again, by intervalIndex.
 * intervalIndex 0..6 indexes this list; SR_GRADUATED_INDEX (7) means "graduated"
 * (no longer scheduled). */
export const SR_INTERVALS = [1, 3, 7, 14, 30, 60, 120] as const;

/** intervalIndex value meaning a topic has graduated out of the SR rotation. */
export const SR_GRADUATED_INDEX = SR_INTERVALS.length; // 7

/** Clamps any value to a valid intervalIndex (0..SR_GRADUATED_INDEX); non-finite → 0. */
function clampIntervalIndex(index: number | undefined): number {
  if (typeof index !== 'number' || !Number.isFinite(index)) {
    return 0;
  }
  return Math.min(SR_GRADUATED_INDEX, Math.max(0, Math.floor(index)));
}

/** The completion day-number for a lesson (LOCAL calendar day of lessonCompletedAt), or null. */
function completionDayNumber(progress: LessonProgress, lessonId: string): number | null {
  const iso = progress.lessonCompletedAt?.[lessonId];
  if (typeof iso !== 'string' || !iso) {
    return null;
  }
  /* Anchor on the LOCAL calendar day of the instant (matching getTodayKey), NOT
   * `iso.slice(0, 10)` (the UTC date). lessonCompletedAt is stored as
   * `new Date().toISOString()` (UTC), so in a negative offset like UTC-7 an evening
   * completion's UTC date is the NEXT day — using it would make a lesson finished
   * "yesterday" evening look completed "today" and never come due (off-by-one). */
  const localKey = isoToLocalDateKey(iso);
  return localKey === null ? null : dateKeyToDayNumber(localKey);
}

/** A lesson's current intervalIndex (0..SR_GRADUATED_INDEX), defaulting to 0. */
function currentIntervalIndex(progress: LessonProgress, lessonId: string): number {
  return clampIntervalIndex(progress.spacedRepetition?.[lessonId]?.intervalIndex ?? 0);
}

/**
 * The day-number at which a completed lesson is next due, or null when it has no
 * completion anchor or has graduated (intervalIndex >= SR_GRADUATED_INDEX).
 */
function dueDayNumber(progress: LessonProgress, lessonId: string): number | null {
  const completedDay = completionDayNumber(progress, lessonId);
  if (completedDay === null) {
    return null;
  }

  const intervalIndex = currentIntervalIndex(progress, lessonId);
  if (intervalIndex >= SR_GRADUATED_INDEX) {
    return null; // graduated
  }

  return completedDay + SR_INTERVALS[intervalIndex];
}

/** Whether a single completed lesson is due for review on `today` (a YYYY-MM-DD key). */
export function isSrTopicDue(progress: LessonProgress, lessonId: string, today: string): boolean {
  const todayNumber = dateKeyToDayNumber(today);
  if (todayNumber === null) {
    return false;
  }

  const due = dueDayNumber(progress, lessonId);
  return due !== null && todayNumber >= due;
}

/**
 * Completed lessons that are due for spaced-repetition review on `today`, ordered
 * MOST-OVERDUE FIRST (stable tiebreak by lessonId). A lesson L is due iff
 * `i <= 6 && today >= C + SR_INTERVALS[i]` (C = completion day, i = intervalIndex).
 */
export function getSrDueTopics(progress: LessonProgress, today: string): string[] {
  const todayNumber = dateKeyToDayNumber(today);
  if (todayNumber === null) {
    return [];
  }

  const due: { lessonId: string; overdueBy: number }[] = [];
  for (const lessonId of progress.completedLessonIds ?? []) {
    const dueDay = dueDayNumber(progress, lessonId);
    if (dueDay !== null && todayNumber >= dueDay) {
      due.push({ lessonId, overdueBy: todayNumber - dueDay });
    }
  }

  due.sort((left, right) => {
    if (right.overdueBy !== left.overdueBy) {
      return right.overdueBy - left.overdueBy;
    }
    return left.lessonId < right.lessonId ? -1 : left.lessonId > right.lessonId ? 1 : 0;
  });

  return due.map((entry) => entry.lessonId);
}

/**
 * Advances the spaced-repetition schedule for the topics a passed required-practice
 * set served, with CARRY-OVER COLLAPSE: each served topic jumps to the smallest
 * interval index whose due date is still in the future (graduating when even the
 * last interval is past), so a long-overdue topic resurfaces exactly ONCE rather
 * than accumulating. Returns a new LessonProgress; never mutates the input.
 *
 *   i' = smallest j in [i..6] with C + SR_INTERVALS[j] > today, else SR_GRADUATED_INDEX
 */
export function advanceSrAfterPass(
  progress: LessonProgress,
  servedTopics: string[],
  today: string,
): LessonProgress {
  const todayNumber = dateKeyToDayNumber(today);
  if (todayNumber === null || !Array.isArray(servedTopics) || servedTopics.length === 0) {
    return progress;
  }

  const spacedRepetition = { ...(progress.spacedRepetition ?? {}) };
  let changed = false;

  for (const lessonId of new Set(servedTopics)) {
    const completedDay = completionDayNumber(progress, lessonId);
    if (completedDay === null) {
      continue;
    }

    const intervalIndex = currentIntervalIndex(progress, lessonId);
    let nextIndex: number = SR_GRADUATED_INDEX;
    for (let candidate = intervalIndex; candidate < SR_INTERVALS.length; candidate += 1) {
      if (completedDay + SR_INTERVALS[candidate] > todayNumber) {
        nextIndex = candidate;
        break;
      }
    }

    spacedRepetition[lessonId] = { intervalIndex: nextIndex, lastServedOn: today };
    changed = true;
  }

  if (!changed) {
    return progress;
  }

  return { ...progress, spacedRepetition };
}

/**
 * The next due date (YYYY-MM-DD) for a lesson, or null when it has no completion
 * anchor or has graduated. Diagnostic helper (not used by the gate itself).
 */
export function getNextDueDate(progress: LessonProgress, lessonId: string): string | null {
  const due = dueDayNumber(progress, lessonId);
  return due === null ? null : dayNumberToDateKey(due);
}
