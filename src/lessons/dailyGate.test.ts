import { describe, expect, it } from 'vitest';
import { isDailyGateActive, isTodayPracticePassed } from './dailyGate';
import type { LessonProgress } from './lessonProgress';

const TODAY = '2026-06-27';

function progressWith(overrides: Partial<LessonProgress>): LessonProgress {
  return {
    completedLessonIds: [],
    dailyCompletionDates: [],
    totalXp: 0,
    ...overrides,
  };
}

describe('isTodayPracticePassed', () => {
  it('reflects whether today is in requiredPracticePassedDates', () => {
    expect(isTodayPracticePassed(progressWith({}), TODAY)).toBe(false);
    expect(
      isTodayPracticePassed(progressWith({ requiredPracticePassedDates: ['2026-06-26'] }), TODAY),
    ).toBe(false);
    expect(
      isTodayPracticePassed(progressWith({ requiredPracticePassedDates: [TODAY] }), TODAY),
    ).toBe(true);
  });
});

describe('isDailyGateActive truth table', () => {
  it('is INACTIVE for a brand-new learner (no completed lessons)', () => {
    expect(isDailyGateActive(progressWith({}), TODAY)).toBe(false);
    // Even if (somehow) a pass date exists, zero completed lessons never gates.
    expect(
      isDailyGateActive(progressWith({ requiredPracticePassedDates: [TODAY] }), TODAY),
    ).toBe(false);
  });

  it('is ACTIVE once a lesson is complete and today is not yet passed', () => {
    expect(isDailyGateActive(progressWith({ completedLessonIds: ['a'] }), TODAY)).toBe(true);
    // Yesterday's pass does not satisfy today.
    expect(
      isDailyGateActive(
        progressWith({ completedLessonIds: ['a'], requiredPracticePassedDates: ['2026-06-26'] }),
        TODAY,
      ),
    ).toBe(true);
  });

  it('is INACTIVE once today is passed', () => {
    expect(
      isDailyGateActive(
        progressWith({ completedLessonIds: ['a'], requiredPracticePassedDates: [TODAY] }),
        TODAY,
      ),
    ).toBe(false);
  });
});
