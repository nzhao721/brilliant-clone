import { describe, expect, it } from 'vitest';
import { dateKeyToDayNumber, dayNumberToDateKey, isoToLocalDateKey } from './dayMath';
import type { LessonProgress } from './lessonProgress';
import {
  SR_GRADUATED_INDEX,
  SR_INTERVALS,
  advanceSrAfterPass,
  getNextDueDate,
  getSrDueTopics,
  isSrTopicDue,
} from './spacedRepetition';

/* Anchor every schedule on a fixed completion day so day-math is exact. Completion
 * timestamps are built at LOCAL noon (see completionIso), so the SR completion-day
 * anchor — the LOCAL calendar day of the instant, matching getTodayKey — is
 * deterministic in any timezone (a UTC-midnight anchor would shift a day in
 * negative offsets like UTC-7). */
const COMPLETION_KEY = '2026-01-01';
const completionDay = dateKeyToDayNumber(COMPLETION_KEY) as number;

/** A date key `days` after the shared completion anchor. */
function plus(days: number): string {
  return dayNumberToDateKey(completionDay + days) as string;
}

/** A lessonCompletedAt ISO for a date key, anchored at LOCAL noon so its LOCAL
 *  calendar day equals dateKey in any runner timezone (mirrors the app, which
 *  buckets the stored UTC instant by its local day). */
function completionIso(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
}

function progressWith(overrides: Partial<LessonProgress>): LessonProgress {
  return {
    completedLessonIds: [],
    dailyCompletionDates: [],
    totalXp: 0,
    ...overrides,
  };
}

/** Progress for one completed lesson anchored at COMPLETION_KEY at a given interval index. */
function lessonProgress(lessonId: string, intervalIndex?: number): LessonProgress {
  return progressWith({
    completedLessonIds: [lessonId],
    lessonCompletedAt: { [lessonId]: completionIso(COMPLETION_KEY) },
    ...(intervalIndex === undefined
      ? {}
      : { spacedRepetition: { [lessonId]: { intervalIndex } } }),
  });
}

describe('SR_INTERVALS', () => {
  it('is the agreed 7-step schedule and graduates at index 7', () => {
    expect([...SR_INTERVALS]).toEqual([1, 3, 7, 14, 30, 60, 120]);
    expect(SR_GRADUATED_INDEX).toBe(7);
  });
});

describe('getSrDueTopics / isSrTopicDue', () => {
  it('is not due on the completion day but due at the first interval', () => {
    const progress = lessonProgress('L');
    expect(getSrDueTopics(progress, plus(0))).toEqual([]);
    expect(isSrTopicDue(progress, 'L', plus(0))).toBe(false);
    expect(getSrDueTopics(progress, plus(1))).toEqual(['L']);
    expect(isSrTopicDue(progress, 'L', plus(1))).toBe(true);
  });

  it('skips lessons without a completion anchor', () => {
    const progress = progressWith({ completedLessonIds: ['L'] });
    expect(getSrDueTopics(progress, plus(30))).toEqual([]);
  });

  it('returns a long-overdue topic exactly ONCE (no accumulation)', () => {
    const progress = lessonProgress('L'); // interval 0, due at day 1
    // 100 days later it is way overdue, yet appears a single time.
    expect(getSrDueTopics(progress, plus(100))).toEqual(['L']);
  });

  it('orders due topics most-overdue first', () => {
    const progress = progressWith({
      completedLessonIds: ['recent', 'old'],
      lessonCompletedAt: {
        recent: completionIso(plus(0)), // due day 1 → barely overdue at day 2
        old: completionIso(COMPLETION_KEY), // anchored far earlier (very overdue)
      },
    });
    // At day 2 of the "recent" lesson, the "old" lesson is far more overdue.
    expect(getSrDueTopics(progress, plus(2))).toEqual(['old', 'recent']);
  });

  it('never lists a graduated topic', () => {
    const graduated = lessonProgress('L', SR_GRADUATED_INDEX);
    expect(getSrDueTopics(graduated, plus(365))).toEqual([]);
    expect(isSrTopicDue(graduated, 'L', plus(365))).toBe(false);
  });

  /* REGRESSION (local vs UTC off-by-one): lessonCompletedAt is stored as a UTC
   * instant, but "today" is a LOCAL day key. A lesson finished YESTERDAY evening
   * (local) whose UTC date is already TODAY must still come due today — the anchor
   * must bucket by the LOCAL day, not `iso.slice(0,10)` (the UTC date). */
  it('treats a lesson completed YESTERDAY evening (local) as due TODAY', () => {
    const todayKey = '2026-03-15';
    const yesterdayKey = '2026-03-14';
    // 23:30 the previous LOCAL day. In a negative offset (e.g. UTC-7) this instant's
    // UTC date is todayKey, so the old UTC-slice anchor never came due (off-by-one).
    const [yy, ym, yd] = yesterdayKey.split('-').map(Number);
    const completedLateLocal = new Date(yy, ym - 1, yd, 23, 30, 0, 0).toISOString();
    // The anchor buckets by the LOCAL calendar day → yesterday, in any timezone.
    expect(isoToLocalDateKey(completedLateLocal)).toBe(yesterdayKey);

    const progress = progressWith({
      completedLessonIds: ['L'],
      lessonCompletedAt: { L: completedLateLocal },
    });

    // Interval 0 → due one day after completion (yesterday + 1 = today).
    expect(isSrTopicDue(progress, 'L', todayKey)).toBe(true);
    expect(getSrDueTopics(progress, todayKey)).toEqual(['L']);
    // ...and correctly NOT yet due on the completion day itself.
    expect(getSrDueTopics(progress, yesterdayKey)).toEqual([]);
  });
});

describe('advanceSrAfterPass (carry-over collapse)', () => {
  it('collapses several overdue intervals into the next FUTURE interval', () => {
    const progress = lessonProgress('L'); // interval 0
    // Day 10: intervals 1,3,7 are all past; the next future boundary is 14 (index 3).
    const advanced = advanceSrAfterPass(progress, ['L'], plus(10));
    expect(advanced.spacedRepetition?.L).toEqual({ intervalIndex: 3, lastServedOn: plus(10) });
    // It is no longer due today, but resurfaces once at day 14.
    expect(getSrDueTopics(advanced, plus(10))).toEqual([]);
    expect(getSrDueTopics(advanced, plus(13))).toEqual([]);
    expect(getSrDueTopics(advanced, plus(14))).toEqual(['L']);
  });

  it('advances exactly one step when served right at the due boundary', () => {
    const progress = lessonProgress('L'); // interval 0, due day 1
    const advanced = advanceSrAfterPass(progress, ['L'], plus(1));
    // Next future boundary after day 1 is day 3 (index 1).
    expect(advanced.spacedRepetition?.L.intervalIndex).toBe(1);
  });

  it('graduates a topic once even the final interval is past', () => {
    const progress = lessonProgress('L'); // interval 0
    const advanced = advanceSrAfterPass(progress, ['L'], plus(120));
    expect(advanced.spacedRepetition?.L.intervalIndex).toBe(SR_GRADUATED_INDEX);
    expect(getSrDueTopics(advanced, plus(400))).toEqual([]);
  });

  it('is monotonic: serving a not-yet-due topic keeps its interval index', () => {
    const progress = lessonProgress('L', 3); // interval 3, due at day 14
    const advanced = advanceSrAfterPass(progress, ['L'], plus(5)); // not due yet
    expect(advanced.spacedRepetition?.L.intervalIndex).toBe(3);
    expect(advanced.spacedRepetition?.L.lastServedOn).toBe(plus(5));
  });

  it('ignores topics without a completion anchor and returns the input unchanged', () => {
    const progress = progressWith({ completedLessonIds: ['L'] });
    expect(advanceSrAfterPass(progress, ['L'], plus(10))).toBe(progress);
    expect(advanceSrAfterPass(lessonProgress('L'), [], plus(10))).toEqual(lessonProgress('L'));
  });
});

describe('getNextDueDate', () => {
  it('reports the next due date for a scheduled lesson and null once graduated', () => {
    expect(getNextDueDate(lessonProgress('L'), 'L')).toBe(plus(1));
    expect(getNextDueDate(lessonProgress('L', 3), 'L')).toBe(plus(14));
    expect(getNextDueDate(lessonProgress('L', SR_GRADUATED_INDEX), 'L')).toBeNull();
    expect(getNextDueDate(progressWith({ completedLessonIds: ['L'] }), 'L')).toBeNull();
  });
});
