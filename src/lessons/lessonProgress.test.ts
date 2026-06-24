import { describe, expect, it } from 'vitest';
import { lessons } from '../data/lessons';
import {
  addDailyStudyMinutesInProgress,
  addStudyTimeInProgress,
  areLessonProgressEqual,
  awardPracticeQuestionInProgress,
  awardQuestionInProgress,
  completeLessonInProgress,
  dailyStreakBonusXp,
  formatCompletionDate,
  formatMinutes,
  getAverageAttemptsPerQuestion,
  getCompletedLessonStepCount,
  getCurrentStreakDays,
  getDaysActiveCount,
  getDaysActiveThisWeek,
  getLessonQuestionCount,
  getLessonQuestionIds,
  getLessonTimeMinutes,
  getLongestStreakDays,
  getOverallAccuracy,
  getPartialLessonProgressPercent,
  getQuestionsAnsweredCorrectlyCount,
  getQuestionsAttemptedCount,
  getQuestionsMasteredCount,
  getSequencedLessonById,
  getSequencedLessons,
  getStudyMinutesFromMilliseconds,
  getTodayKey,
  getTotalQuestionCount,
  getTotalStudyMinutes,
  getXpForLevel,
  getXpLevel,
  mergeLessonProgress,
  practiceQuestionXp,
  questionCompletionXp,
  recordLessonTimeInProgress,
  recordQuestionAttemptInProgress,
  shouldSaveMergedProgress,
  xpBasePerLevel,
  xpLevelStep,
  type LessonProgress,
} from './lessonProgress';

describe('lesson sequencing', () => {
  it('only unlocks the first lesson when nothing is complete', () => {
    const sequencedLessons = getSequencedLessons(lessons, []);

    expect(sequencedLessons[0].status).toBe('available');
    expect(sequencedLessons[1].status).toBe('locked');
    expect(sequencedLessons[1].lockedReason).toBe('Complete Lesson 1 first.');
  });

  it('unlocks the next interactive lesson after the previous lesson is complete', () => {
    const sequencedLessons = getSequencedLessons(lessons, ['what-changes']);

    expect(sequencedLessons[0].status).toBe('complete');
    expect(sequencedLessons[1].status).toBe('available');
    expect(sequencedLessons[2].status).toBe('locked');
  });

  it('does not count out-of-order completions', () => {
    const sequencedLessons = getSequencedLessons(lessons, ['slope-refresher']);

    expect(sequencedLessons[0].status).toBe('available');
    expect(sequencedLessons[1].status).toBe('locked');
  });

  it('finds a sequenced lesson by id', () => {
    expect(getSequencedLessonById(lessons, [], 'what-changes')?.sequenceNumber).toBe(1);
    expect(getSequencedLessonById(lessons, [], 'missing')).toBeUndefined();
  });

  it('counts only completed steps for partial lesson progress', () => {
    const resumeState = {
      questionStates: {
        'table-change': {
          answerResult: 'correct' as const,
          selectedOptionId: 'four',
          showHint: false,
        },
      },
      stepIndex: 3,
    };

    expect(getCompletedLessonStepCount(lessons[0], resumeState)).toBe(3);
    expect(getPartialLessonProgressPercent(lessons[0], resumeState)).toBe(43);
  });

  it('does not count the current unanswered question for partial lesson progress', () => {
    const resumeState = {
      questionStates: {
        'table-change': {
          answerResult: 'correct' as const,
          selectedOptionId: 'four',
          showHint: false,
        },
      },
      stepIndex: 3,
    };

    expect(lessons[0].steps[3].type).toBe('multiple-choice');
    expect(getPartialLessonProgressPercent(lessons[0], resumeState)).not.toBe(57);
  });

  it('awards lesson XP and first-completion daily bonus', () => {
    const progress: LessonProgress = {
      completedLessonIds: [],
      dailyCompletionDates: [],
      totalXp: 0,
    };

    const questionIds = getLessonQuestionIds(lessons[0]);
    const result = completeLessonInProgress(progress, 'what-changes', questionIds, '2026-06-23');
    const expectedLessonXp = questionIds.length * questionCompletionXp;

    expect(result.award.questionsAnswered).toBe(questionIds.length);
    expect(result.award.lessonXp).toBe(expectedLessonXp);
    expect(result.award.dailyBonusXp).toBe(dailyStreakBonusXp);
    expect(result.award.totalXpGained).toBe(expectedLessonXp + dailyStreakBonusXp);
    expect(result.progress.totalXp).toBe(expectedLessonXp + dailyStreakBonusXp);
  });

  it('awards XP when a question is answered correctly', () => {
    const progress: LessonProgress = {
      completedLessonIds: [],
      dailyCompletionDates: [],
      totalXp: 0,
    };

    const result = awardQuestionInProgress(progress, 'what-changes', 'table-change');

    expect(result.xpGained).toBe(questionCompletionXp);
    expect(result.progress.totalXp).toBe(questionCompletionXp);
    expect(result.progress.awardedQuestionIds?.['what-changes']).toEqual(['table-change']);
  });

  it('does not award duplicate question XP', () => {
    const progress: LessonProgress = {
      awardedQuestionIds: {
        'what-changes': ['table-change'],
      },
      completedLessonIds: [],
      dailyCompletionDates: [],
      totalXp: 20,
    };

    const result = awardQuestionInProgress(progress, 'what-changes', 'table-change');

    expect(result.alreadyAwarded).toBe(true);
    expect(result.xpGained).toBe(0);
    expect(result.progress.totalXp).toBe(20);
    expect(result.progress.awardedQuestionIds?.['what-changes']).toEqual(['table-change']);
  });

  it('does not award duplicate lesson XP', () => {
    const progress: LessonProgress = {
      completedLessonIds: ['what-changes'],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 125,
    };

    const result = completeLessonInProgress(
      progress,
      'what-changes',
      getLessonQuestionIds(lessons[0]),
      '2026-06-23',
    );

    expect(result.award.alreadyCompleted).toBe(true);
    expect(result.award.totalXpGained).toBe(0);
    expect(result.progress.totalXp).toBe(125);
  });

  it('clears saved partial progress when a lesson is completed', () => {
    const progress: LessonProgress = {
      completedLessonIds: [],
      dailyCompletionDates: [],
      lessonResumeStates: {
        'what-changes': {
          questionStates: {
            'table-change': {
              answerResult: null,
              selectedOptionId: 'one',
              showHint: true,
            },
          },
          stepIndex: 1,
        },
      },
      totalXp: 0,
    };

    const result = completeLessonInProgress(
      progress,
      'what-changes',
      getLessonQuestionIds(lessons[0]),
      '2026-06-23',
    );

    expect(result.progress.lessonResumeStates?.['what-changes']).toBeUndefined();
  });

  it('scales the daily bonus with the current streak length', () => {
    const progress: LessonProgress = {
      completedLessonIds: ['what-changes'],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 125,
    };

    const questionIds = getLessonQuestionIds(lessons[1]);
    const result = completeLessonInProgress(
      progress,
      'slope-refresher',
      questionIds,
      '2026-06-24',
    );
    const expectedLessonXp = questionIds.length * questionCompletionXp;

    expect(result.award.dailyBonusXp).toBe(dailyStreakBonusXp * 2);
    expect(result.award.totalXpGained).toBe(expectedLessonXp + dailyStreakBonusXp * 2);
    expect(result.progress.totalXp).toBe(125 + expectedLessonXp + dailyStreakBonusXp * 2);
  });

  it('does not award a second daily bonus on the same day', () => {
    const progress: LessonProgress = {
      completedLessonIds: ['what-changes'],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 125,
    };

    const questionIds = getLessonQuestionIds(lessons[1]);
    const result = completeLessonInProgress(
      progress,
      'slope-refresher',
      questionIds,
      '2026-06-23',
    );
    const expectedLessonXp = questionIds.length * questionCompletionXp;

    expect(result.award.lessonXp).toBe(expectedLessonXp);
    expect(result.award.dailyBonusXp).toBe(0);
    expect(result.award.totalXpGained).toBe(expectedLessonXp);
  });

  it('calculates current streak days', () => {
    expect(getCurrentStreakDays(['2026-06-21', '2026-06-22', '2026-06-23'], '2026-06-23')).toBe(
      3,
    );
    expect(getCurrentStreakDays(['2026-06-21', '2026-06-22'], '2026-06-23')).toBe(2);
    expect(getCurrentStreakDays(['2026-06-21', '2026-06-22'], '2026-06-24')).toBe(0);
    expect(getCurrentStreakDays(['2026-06-21'], '2026-06-23')).toBe(0);
  });

  it('converts active lesson time into whole study minutes', () => {
    expect(getStudyMinutesFromMilliseconds(0)).toBe(0);
    expect(getStudyMinutesFromMilliseconds(45_000)).toBe(1);
    expect(getStudyMinutesFromMilliseconds(125_000)).toBe(2);
  });

  it('adds daily study minutes without changing other progress', () => {
    const progress: LessonProgress = {
      completedLessonIds: ['what-changes'],
      dailyCompletionDates: ['2026-06-23'],
      dailyStudyMinutes: {
        '2026-06-23': 4,
      },
      totalXp: 125,
    };

    const result = addDailyStudyMinutesInProgress(progress, '2026-06-23', 125_000);

    expect(result.dailyStudyMinutes?.['2026-06-23']).toBe(6);
    expect(result.completedLessonIds).toEqual(['what-changes']);
    expect(result.totalXp).toBe(125);
  });

  it('merges remote and local progress without reopening completed lessons', () => {
    const remoteProgress: LessonProgress = {
      awardedQuestionIds: {
        'what-changes': ['table-change'],
      },
      completedLessonIds: ['what-changes'],
      dailyCompletionDates: ['2026-06-22'],
      dailyStudyMinutes: {
        '2026-06-22': 4,
      },
      lessonResumeStates: {
        'what-changes': {
          questionStates: {},
          stepIndex: 2,
        },
      },
      totalXp: 125,
    };
    const localProgress: LessonProgress = {
      awardedQuestionIds: {
        'slope-refresher': ['slope-meaning'],
      },
      completedLessonIds: [],
      dailyCompletionDates: ['2026-06-23'],
      dailyStudyMinutes: {
        '2026-06-22': 2,
        '2026-06-23': 7,
      },
      lessonResumeStates: {
        'slope-refresher': {
          questionStates: {},
          stepIndex: 1,
        },
      },
      totalXp: 20,
    };

    const mergedProgress = mergeLessonProgress(remoteProgress, localProgress);

    expect(mergedProgress.completedLessonIds).toEqual(['what-changes']);
    expect(mergedProgress.dailyCompletionDates).toEqual(['2026-06-22', '2026-06-23']);
    expect(mergedProgress.dailyStudyMinutes).toEqual({
      '2026-06-22': 4,
      '2026-06-23': 7,
    });
    expect(mergedProgress.lessonResumeStates?.['what-changes']).toBeUndefined();
    expect(mergedProgress.lessonResumeStates?.['slope-refresher']?.stepIndex).toBe(1);
    expect(mergedProgress.totalXp).toBe(125);
  });

  it('detects equivalent progress regardless of map key order', () => {
    const leftProgress: LessonProgress = {
      completedLessonIds: ['what-changes'],
      dailyCompletionDates: ['2026-06-23'],
      dailyStudyMinutes: {
        '2026-06-23': 6,
        '2026-06-22': 4,
      },
      totalXp: 125,
    };
    const rightProgress: LessonProgress = {
      completedLessonIds: ['what-changes'],
      dailyCompletionDates: ['2026-06-23'],
      dailyStudyMinutes: {
        '2026-06-22': 4,
        '2026-06-23': 6,
      },
      totalXp: 125,
    };

    expect(areLessonProgressEqual(leftProgress, rightProgress)).toBe(true);
  });

  it('skips redundant Firestore saves after merging unchanged remote progress', () => {
    const remoteProgress: LessonProgress = {
      completedLessonIds: ['what-changes'],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 125,
    };
    const localProgress: LessonProgress = {
      completedLessonIds: ['what-changes'],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 125,
    };
    const mergedProgress = mergeLessonProgress(remoteProgress, localProgress);

    expect(shouldSaveMergedProgress(remoteProgress, localProgress, mergedProgress)).toBe(false);
  });

  it('saves merged progress when local progress adds data missing from Firestore', () => {
    const remoteProgress: LessonProgress = {
      completedLessonIds: ['what-changes'],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 125,
    };
    const localProgress: LessonProgress = {
      completedLessonIds: ['what-changes', 'slope-refresher'],
      dailyCompletionDates: ['2026-06-23', '2026-06-24'],
      totalXp: 250,
    };
    const mergedProgress = mergeLessonProgress(remoteProgress, localProgress);

    expect(shouldSaveMergedProgress(remoteProgress, localProgress, mergedProgress)).toBe(true);
  });
});

function baseProgress(overrides: Partial<LessonProgress> = {}): LessonProgress {
  return {
    completedLessonIds: [],
    dailyCompletionDates: [],
    totalXp: 0,
    ...overrides,
  };
}

describe('longest streak', () => {
  it('returns 0 for empty input and 1 for a single day', () => {
    expect(getLongestStreakDays([])).toBe(0);
    expect(getLongestStreakDays(['2026-06-20'])).toBe(1);
  });

  it('finds the longest consecutive run with gaps', () => {
    expect(
      getLongestStreakDays(['2026-06-20', '2026-06-21', '2026-06-24', '2026-06-25', '2026-06-26']),
    ).toBe(3);
  });

  it('handles unsorted input and duplicates', () => {
    expect(getLongestStreakDays(['2026-06-22', '2026-06-20', '2026-06-21', '2026-06-22'])).toBe(3);
  });

  it('counts runs that cross a month boundary', () => {
    expect(getLongestStreakDays(['2026-06-30', '2026-07-01', '2026-07-02'])).toBe(3);
  });

  it('ignores malformed date keys', () => {
    expect(getLongestStreakDays(['nope', '2026-06-20', '2026-06-21'])).toBe(2);
  });
});

describe('study time totals', () => {
  it('sums all-time study minutes', () => {
    expect(getTotalStudyMinutes(baseProgress({ dailyStudyMinutes: { a: 5, b: 7 } }))).toBe(12);
    expect(getTotalStudyMinutes(baseProgress())).toBe(0);
  });

  it('formats minutes for display', () => {
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(135)).toBe('2h 15m');
  });
});

describe('active days', () => {
  it('counts the union of study days and completion days', () => {
    const progress = baseProgress({
      dailyCompletionDates: ['2026-06-20', '2026-06-22'],
      dailyStudyMinutes: { '2026-06-20': 5, '2026-06-21': 8, '2026-06-23': 0 },
    });

    // 06-20 (both), 06-21 (study), 06-22 (completion); 06-23 has 0 minutes → not active.
    expect(getDaysActiveCount(progress)).toBe(3);
  });

  it('counts active days within the rolling 7-day window ending today', () => {
    const progress = baseProgress({
      dailyCompletionDates: ['2026-06-17', '2026-06-23'],
      dailyStudyMinutes: { '2026-06-16': 10, '2026-06-23': 5 },
    });

    // Window 06-17..06-23: 06-17 (6 days ago, included edge) and 06-23; 06-16 is 7 days ago.
    expect(getDaysActiveThisWeek(progress, '2026-06-23')).toBe(2);
  });

  it('uses the provided today key so the test-day-offset scheme works', () => {
    const today = getTodayKey(0);
    const progress = baseProgress({ dailyCompletionDates: [today] });

    expect(getDaysActiveThisWeek(progress, today)).toBe(1);
  });
});

describe('xp levels', () => {
  it('uses a progressive curve where each level costs 50 XP more than the last', () => {
    expect(xpBasePerLevel).toBe(100);
    expect(xpLevelStep).toBe(50);
    expect(getXpForLevel(1)).toBe(100);
    expect(getXpForLevel(2)).toBe(150);
    expect(getXpForLevel(3)).toBe(200);
  });

  it('maps total XP onto the progressive leveling curve at the boundaries', () => {
    expect(getXpLevel(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForLevel: 100, xpToNextLevel: 100 });
    expect(getXpLevel(99)).toEqual({ level: 1, xpIntoLevel: 99, xpForLevel: 100, xpToNextLevel: 1 });
    expect(getXpLevel(100)).toEqual({ level: 2, xpIntoLevel: 0, xpForLevel: 150, xpToNextLevel: 150 });
    expect(getXpLevel(250)).toEqual({ level: 3, xpIntoLevel: 0, xpForLevel: 200, xpToNextLevel: 200 });
    expect(getXpLevel(300)).toEqual({ level: 3, xpIntoLevel: 50, xpForLevel: 200, xpToNextLevel: 150 });
  });

  it('treats negative or invalid XP as zero', () => {
    expect(getXpLevel(-20)).toEqual({ level: 1, xpIntoLevel: 0, xpForLevel: 100, xpToNextLevel: 100 });
  });
});

describe('accuracy and attempts', () => {
  it('returns 0 accuracy when there are no attempts', () => {
    expect(getOverallAccuracy(baseProgress())).toBe(0);
  });

  it('computes overall accuracy across all attempts', () => {
    const progress = baseProgress({
      questionAttempts: {
        q1: { correct: 3, incorrect: 1 },
        q2: { correct: 1, incorrect: 0 },
      },
    });

    // 4 correct / 5 attempts = 80%.
    expect(getOverallAccuracy(progress)).toBe(80);
  });

  it('includes completed lessons (no recorded submissions) as correct', () => {
    const progress = baseProgress({
      awardedQuestionIds: { 'what-changes': ['a', 'b', 'c'] },
    });

    // 3 awarded questions, 0 recorded submissions → 3/3 = 100% (not 0%).
    expect(getOverallAccuracy(progress)).toBe(100);
  });

  it('stays consistent with the attempted and answered-correctly counts', () => {
    const progress = baseProgress({
      questionAttempts: { q1: { correct: 1, incorrect: 1 } },
      awardedQuestionIds: { 'what-changes': ['a'] },
    });

    // attempted = 2 submissions + 1 awarded = 3; correct = 1 + 1 = 2 → 67%.
    expect(getQuestionsAttemptedCount(progress)).toBe(3);
    expect(getQuestionsAnsweredCorrectlyCount(progress)).toBe(2);
    expect(getOverallAccuracy(progress)).toBe(67);
  });

  it('computes average attempts per attempted question', () => {
    expect(getAverageAttemptsPerQuestion(baseProgress())).toBe(0);

    const progress = baseProgress({
      questionAttempts: {
        q1: { correct: 1, incorrect: 0 },
        q2: { correct: 1, incorrect: 1 },
      },
    });

    // (1 + 2) attempts / 2 questions = 1.5.
    expect(getAverageAttemptsPerQuestion(progress)).toBe(1.5);
  });
});

describe('questions mastered totals', () => {
  it('counts mastered questions across lessons', () => {
    const progress = baseProgress({
      awardedQuestionIds: { 'what-changes': ['a', 'b'], 'slope-refresher': ['c'] },
    });

    expect(getQuestionsMasteredCount(progress)).toBe(3);
  });

  it('counts total questions across the provided lessons', () => {
    const expectedTotal = lessons.reduce((total, lesson) => total + getLessonQuestionCount(lesson), 0);

    expect(getTotalQuestionCount(lessons)).toBe(expectedTotal);
    expect(getTotalQuestionCount(lessons)).toBeGreaterThan(0);
  });
});

describe('questions attempted and answered correctly', () => {
  it('totals attempts and correct answers across lessons and practice', () => {
    expect(getQuestionsAttemptedCount(baseProgress())).toBe(0);
    expect(getQuestionsAnsweredCorrectlyCount(baseProgress())).toBe(0);

    const progress = baseProgress({
      questionAttempts: {
        q1: { correct: 1, incorrect: 1 },
        q2: { correct: 2, incorrect: 0 },
      },
    });

    // 4 total attempts, 3 of them correct.
    expect(getQuestionsAttemptedCount(progress)).toBe(4);
    expect(getQuestionsAnsweredCorrectlyCount(progress)).toBe(3);
  });

  it('counts lessons completed via the shortcut as correct attempts', () => {
    const questionIds = getLessonQuestionIds(lessons[0]);
    const result = completeLessonInProgress(baseProgress(), 'what-changes', questionIds, '2026-06-23');

    expect(questionIds.length).toBeGreaterThan(0);
    expect(getQuestionsAttemptedCount(result.progress)).toBe(questionIds.length);
    expect(getQuestionsAnsweredCorrectlyCount(result.progress)).toBe(questionIds.length);
  });

  it('does not double-count a question already answered in the lesson player', () => {
    const questionIds = getLessonQuestionIds(lessons[0]);
    // Simulate the player: the first question was answered (attempt recorded) and awarded.
    let progress = recordQuestionAttemptInProgress(baseProgress(), questionIds[0], true);
    progress = awardQuestionInProgress(progress, 'what-changes', questionIds[0]).progress;

    const result = completeLessonInProgress(progress, 'what-changes', questionIds, '2026-06-23');

    // Still exactly one attempt per question (the answered one is not re-recorded).
    expect(getQuestionsAttemptedCount(result.progress)).toBe(questionIds.length);
    expect(getQuestionsAnsweredCorrectlyCount(result.progress)).toBe(questionIds.length);
  });
});

describe('practice question awards', () => {
  it('gives 10 XP for a correct answer plus the streak bonus on the first activity of the day', () => {
    const today = getTodayKey();
    const result = awardPracticeQuestionInProgress(
      baseProgress({ totalXp: 100, dailyCompletionDates: [] }),
      true,
      today,
    );

    expect(result.award.questionXp).toBe(practiceQuestionXp);
    expect(result.award.dailyBonusXp).toBe(dailyStreakBonusXp); // day-1 streak × bonus
    expect(result.award.totalXpGained).toBe(practiceQuestionXp + dailyStreakBonusXp);
    expect(result.progress.totalXp).toBe(100 + practiceQuestionXp + dailyStreakBonusXp);
    expect(result.progress.dailyCompletionDates).toContain(today);
  });

  it('skips the daily bonus on later answers the same day and gives no XP for a wrong answer', () => {
    const today = getTodayKey();
    const seeded = baseProgress({ totalXp: 0, dailyCompletionDates: [today] });

    const correctAgain = awardPracticeQuestionInProgress(seeded, true, today);
    expect(correctAgain.award.dailyBonusXp).toBe(0);
    expect(correctAgain.award.totalXpGained).toBe(practiceQuestionXp);

    const wrong = awardPracticeQuestionInProgress(seeded, false, today);
    expect(wrong.award.questionXp).toBe(0);
    expect(wrong.award.totalXpGained).toBe(0);
  });

  it('maintains a streak: practicing today after yesterday yields a 2-day streak bonus', () => {
    const result = awardPracticeQuestionInProgress(
      baseProgress({ totalXp: 0, dailyCompletionDates: [getTodayKey(-1)] }),
      false,
      getTodayKey(),
    );

    expect(result.award.dailyBonusXp).toBe(2 * dailyStreakBonusXp);
    expect(result.progress.dailyCompletionDates).toContain(getTodayKey());
  });
});

describe('attempt recording', () => {
  it('increments correct and incorrect counters per question', () => {
    let progress = baseProgress();
    progress = recordQuestionAttemptInProgress(progress, 'q1', false);
    progress = recordQuestionAttemptInProgress(progress, 'q1', true);

    expect(progress.questionAttempts?.['q1']).toEqual({ correct: 1, incorrect: 1 });

    progress = recordQuestionAttemptInProgress(progress, 'q1', true);

    expect(progress.questionAttempts?.['q1']).toEqual({ correct: 2, incorrect: 1 });
  });
});

describe('per-lesson time', () => {
  it('accumulates per-lesson study time in milliseconds', () => {
    let progress = baseProgress();
    progress = recordLessonTimeInProgress(progress, 'what-changes', 125_000);
    progress = recordLessonTimeInProgress(progress, 'what-changes', 60_000);

    expect(progress.lessonTimeSpentMs?.['what-changes']).toBe(185_000);
    expect(getLessonTimeMinutes(progress, 'what-changes')).toBe(3);
    expect(getLessonTimeMinutes(progress, 'missing')).toBe(0);
  });

  it('ignores non-positive elapsed time', () => {
    expect(recordLessonTimeInProgress(baseProgress(), 'what-changes', 0).lessonTimeSpentMs).toEqual(
      {},
    );
  });

  it('records study time into both daily minutes and per-lesson totals', () => {
    const progress = addStudyTimeInProgress(baseProgress(), '2026-06-23', 'what-changes', 125_000);

    expect(progress.dailyStudyMinutes?.['2026-06-23']).toBe(2);
    expect(progress.lessonTimeSpentMs?.['what-changes']).toBe(125_000);
  });
});

describe('completion timestamps', () => {
  it('records the first-completion timestamp once and never overwrites it', () => {
    const questionIds = getLessonQuestionIds(lessons[0]);
    const first = completeLessonInProgress(
      baseProgress(),
      'what-changes',
      questionIds,
      '2026-06-23',
      '2026-06-23T10:00:00.000Z',
    );

    expect(first.progress.lessonCompletedAt?.['what-changes']).toBe('2026-06-23T10:00:00.000Z');

    const second = completeLessonInProgress(
      first.progress,
      'what-changes',
      questionIds,
      '2026-06-24',
      '2026-06-24T10:00:00.000Z',
    );

    expect(second.progress.lessonCompletedAt?.['what-changes']).toBe('2026-06-23T10:00:00.000Z');
  });

  it('keeps a pre-existing timestamp when first completing a lesson', () => {
    const progress = baseProgress({
      lessonCompletedAt: { 'what-changes': '2026-06-01T00:00:00.000Z' },
    });

    const result = completeLessonInProgress(
      progress,
      'what-changes',
      getLessonQuestionIds(lessons[0]),
      '2026-06-23',
      '2026-06-23T10:00:00.000Z',
    );

    expect(result.progress.lessonCompletedAt?.['what-changes']).toBe('2026-06-01T00:00:00.000Z');
  });

  it('formats an ISO completion timestamp as a short date', () => {
    expect(formatCompletionDate('2026-06-23T12:00:00.000Z')).toBe('Jun 23');
    expect(formatCompletionDate(undefined)).toBeNull();
    expect(formatCompletionDate('not-a-date')).toBeNull();
  });
});

describe('merging analytics fields', () => {
  it('max-merges counters and time and keeps the earliest timestamp', () => {
    const remoteProgress: LessonProgress = baseProgress({
      questionAttempts: {
        q1: { correct: 2, incorrect: 1 },
        q2: { correct: 0, incorrect: 1 },
      },
      lessonTimeSpentMs: { 'what-changes': 120_000 },
      lessonCompletedAt: { 'what-changes': '2026-06-10T00:00:00.000Z' },
    });
    const localProgress: LessonProgress = baseProgress({
      questionAttempts: {
        q1: { correct: 1, incorrect: 3 },
        q3: { correct: 1, incorrect: 0 },
      },
      lessonTimeSpentMs: { 'what-changes': 90_000, 'slope-refresher': 30_000 },
      lessonCompletedAt: { 'what-changes': '2026-06-05T00:00:00.000Z' },
    });

    const merged = mergeLessonProgress(remoteProgress, localProgress);

    expect(merged.questionAttempts).toEqual({
      q1: { correct: 2, incorrect: 3 },
      q2: { correct: 0, incorrect: 1 },
      q3: { correct: 1, incorrect: 0 },
    });
    expect(merged.lessonTimeSpentMs).toEqual({
      'what-changes': 120_000,
      'slope-refresher': 30_000,
    });
    expect(merged.lessonCompletedAt).toEqual({ 'what-changes': '2026-06-05T00:00:00.000Z' });
  });

  it('normalizes malformed analytics fields defensively', () => {
    const malformedLocal = {
      completedLessonIds: [],
      dailyCompletionDates: [],
      totalXp: 0,
      questionAttempts: {
        good: { correct: 2, incorrect: -1 },
        bad: 'nope',
        empty: { correct: 0, incorrect: 0 },
      },
      lessonTimeSpentMs: { ok: 5_000, neg: -10, broken: Number.NaN },
      lessonCompletedAt: { ok: '2026-06-01T00:00:00.000Z', bad: 5 },
    } as unknown as LessonProgress;

    const merged = mergeLessonProgress(baseProgress(), malformedLocal);

    expect(merged.questionAttempts).toEqual({ good: { correct: 2, incorrect: 0 } });
    expect(merged.lessonTimeSpentMs).toEqual({ ok: 5_000 });
    expect(merged.lessonCompletedAt).toEqual({ ok: '2026-06-01T00:00:00.000Z' });
  });

  it('loads legacy progress saved without the new analytics fields', () => {
    const legacyProgress = {
      completedLessonIds: ['what-changes'],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 125,
    } as LessonProgress;

    const normalized = mergeLessonProgress(baseProgress(), legacyProgress);

    expect(normalized.questionAttempts).toEqual({});
    expect(normalized.lessonCompletedAt).toEqual({});
    expect(normalized.lessonTimeSpentMs).toEqual({});
    expect(normalized.completedLessonIds).toEqual(['what-changes']);
    expect(normalized.totalXp).toBe(125);
  });
});
