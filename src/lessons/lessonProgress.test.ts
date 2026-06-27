import { describe, expect, it } from 'vitest';
import { lessons, type Lesson, type LessonStep } from '../data/lessons';
import { questionBank } from '../data/questionBank';
import { getXpForLevel, getXpLevel, xpBasePerLevel, xpLevelStep } from '../lib/xpLevel';
import {
  addDailyStudyMinutesInProgress,
  addStudyTimeInProgress,
  areLessonProgressEqual,
  awardChallengeQuestionInProgress,
  awardPracticeQuestionInProgress,
  awardQuestionInProgress,
  challengeRewardMultiplier,
  coinsPerCorrectAnswer,
  completeLessonInProgress,
  dailyStreakBonusXp,
  formatCompletionDate,
  formatMinutes,
  getChapterLessonProgress,
  getCompletedLessonStepCount,
  getCurrentStreakDays,
  getDaysActiveCount,
  getDaysActiveThisWeek,
  getLessonQuestionIds,
  getLessonTimeMinutes,
  getLongestStreakDays,
  getOverallAccuracy,
  getPartialLessonProgressPercent,
  getQuestionsAnsweredCorrectlyCount,
  getQuestionsAttemptedCount,
  getSequencedLessonById,
  getSequencedLessons,
  getStudyMinutesFromMilliseconds,
  getTodayKey,
  getTopicKey,
  getTotalStudyMinutes,
  isChapterPracticeAvailable,
  lessonCompletionCoinBonus,
  mergeLessonProgress,
  practiceQuestionXp,
  questionCompletionXp,
  recentMistakesLimit,
  recordLessonTimeInProgress,
  recordQuestionAttemptInProgress,
  recordResponseInProgress,
  shouldSaveMergedProgress,
  type LessonProgress,
  type RecentMistake,
  type ResponseContext,
} from './lessonProgress';

/* Inline fixtures keep these tests independent of the authored course content.
 * The fixture course spans two chapters to exercise the chapter-aware helpers. */
function conceptStep(id: string): LessonStep {
  return { id, type: 'concept', title: id, body: `${id} body` };
}

function questionStep(id: string): LessonStep {
  return {
    id,
    type: 'multiple-choice',
    title: id,
    prompt: `${id} prompt`,
    options: [
      { id: 'right', label: 'Right' },
      { id: 'wrong', label: 'Wrong' },
    ],
    correctOptionId: 'right',
    correctExplanation: 'Correct explanation.',
    incorrectExplanation: 'Incorrect explanation.',
  };
}

function makeLesson(overrides: Partial<Lesson> & Pick<Lesson, 'id'>): Lesson {
  return {
    chapterId: 'functions-and-graphs',
    title: 'Sample lesson',
    description: 'A sample lesson.',
    status: 'available',
    estimatedMinutes: 5,
    steps: [],
    ...overrides,
  };
}

// lessonA: 7 steps (4 concept, 3 questions) so partial-progress math is exact.
const lessonA = makeLesson({
  id: 'lesson-a',
  chapterId: 'functions-and-graphs',
  title: 'Lesson A',
  steps: [
    conceptStep('a-c1'),
    questionStep('qA'),
    conceptStep('a-c2'),
    questionStep('qB'),
    conceptStep('a-c3'),
    questionStep('qC'),
    conceptStep('a-c4'),
  ],
});
const lessonB = makeLesson({
  id: 'lesson-b',
  chapterId: 'functions-and-graphs',
  title: 'Lesson B',
  steps: [conceptStep('b-c1'), questionStep('qD'), questionStep('qE')],
});
const lessonC = makeLesson({
  id: 'lesson-c',
  chapterId: 'limits',
  title: 'Lesson C',
  steps: [conceptStep('c-c1'), questionStep('qF')],
});
const fixtureLessons = [lessonA, lessonB, lessonC];

describe('lesson sequencing', () => {
  it('only unlocks the first lesson when nothing is complete', () => {
    const sequencedLessons = getSequencedLessons(fixtureLessons, []);

    expect(sequencedLessons[0].status).toBe('available');
    expect(sequencedLessons[1].status).toBe('locked');
    expect(sequencedLessons[1].lockedReason).toBe('Complete Lesson 1 first.');
  });

  it('unlocks the next interactive lesson after the previous lesson is complete', () => {
    const sequencedLessons = getSequencedLessons(fixtureLessons, ['lesson-a']);

    expect(sequencedLessons[0].status).toBe('complete');
    expect(sequencedLessons[1].status).toBe('available');
    expect(sequencedLessons[2].status).toBe('locked');
  });

  it('does not count out-of-order completions', () => {
    const sequencedLessons = getSequencedLessons(fixtureLessons, ['lesson-b']);

    expect(sequencedLessons[0].status).toBe('available');
    expect(sequencedLessons[1].status).toBe('locked');
  });

  it('marks a content-less lesson as locked with a coming-soon reason', () => {
    const emptyLesson = makeLesson({ id: 'empty', steps: [] });
    const sequencedLessons = getSequencedLessons([lessonA, emptyLesson], ['lesson-a']);

    expect(sequencedLessons[1].status).toBe('locked');
    expect(sequencedLessons[1].lockedReason).toBe('Coming soon.');
  });

  it('finds a sequenced lesson by id', () => {
    expect(getSequencedLessonById(fixtureLessons, [], 'lesson-a')?.sequenceNumber).toBe(1);
    expect(getSequencedLessonById(fixtureLessons, [], 'missing')).toBeUndefined();
  });

  it('counts only completed steps for partial lesson progress', () => {
    const resumeState = {
      questionStates: {
        qA: {
          answerResult: 'correct' as const,
          selectedOptionId: 'right',
          showHint: false,
        },
      },
      stepIndex: 3,
    };

    expect(getCompletedLessonStepCount(lessonA, resumeState)).toBe(3);
    expect(getPartialLessonProgressPercent(lessonA, resumeState)).toBe(43);
  });

  it('does not count the current unanswered question for partial lesson progress', () => {
    const resumeState = {
      questionStates: {
        qA: {
          answerResult: 'correct' as const,
          selectedOptionId: 'right',
          showHint: false,
        },
      },
      stepIndex: 3,
    };

    expect(lessonA.steps[3].type).toBe('multiple-choice');
    expect(getPartialLessonProgressPercent(lessonA, resumeState)).not.toBe(57);
  });

  it('awards lesson XP and first-completion daily bonus', () => {
    const progress: LessonProgress = {
      completedLessonIds: [],
      dailyCompletionDates: [],
      totalXp: 0,
    };

    const questionIds = getLessonQuestionIds(lessonA);
    const result = completeLessonInProgress(progress, lessonA.id, questionIds, '2026-06-23');
    const expectedLessonXp = questionIds.length * questionCompletionXp;

    expect(questionIds.length).toBeGreaterThan(0);
    expect(result.award.questionsAnswered).toBe(questionIds.length);
    expect(result.award.lessonXp).toBe(expectedLessonXp);
    expect(result.award.dailyBonusXp).toBe(dailyStreakBonusXp);
    expect(result.award.totalXpGained).toBe(expectedLessonXp + dailyStreakBonusXp);
    /* Flat coins per correct answer + flat completion bonus; streak is XP-only. */
    const expectedLessonCoins =
      questionIds.length * coinsPerCorrectAnswer + lessonCompletionCoinBonus;
    expect(result.award.coinsGained).toBe(expectedLessonCoins);
    expect(result.award.coinsGained).toBeLessThan(result.award.totalXpGained);
    expect(result.progress.totalXp).toBe(expectedLessonXp + dailyStreakBonusXp);
    // Lifetime coins accumulate the per-question coins + flat bonus (no streak).
    expect(result.progress.totalCoinsEarned).toBe(expectedLessonCoins);
  });

  it('awards XP when a question is answered correctly', () => {
    const progress: LessonProgress = {
      completedLessonIds: [],
      dailyCompletionDates: [],
      totalXp: 0,
    };

    const result = awardQuestionInProgress(progress, lessonA.id, 'qA');

    expect(result.xpGained).toBe(questionCompletionXp);
    expect(result.progress.totalXp).toBe(questionCompletionXp);
    expect(result.progress.awardedQuestionIds?.[lessonA.id]).toEqual(['qA']);
    // A correct answer earns a flat coin amount (fewer than the XP it grants).
    expect(result.coinsGained).toBe(coinsPerCorrectAnswer);
    expect(result.coinsGained).toBeLessThan(result.xpGained);
    expect(result.progress.totalCoinsEarned).toBe(coinsPerCorrectAnswer);
  });

  it('does not award duplicate question XP', () => {
    const progress: LessonProgress = {
      awardedQuestionIds: {
        [lessonA.id]: ['qA'],
      },
      completedLessonIds: [],
      dailyCompletionDates: [],
      totalXp: 20,
    };

    const result = awardQuestionInProgress(progress, lessonA.id, 'qA');

    expect(result.alreadyAwarded).toBe(true);
    expect(result.xpGained).toBe(0);
    expect(result.coinsGained).toBe(0);
    expect(result.progress.totalXp).toBe(20);
    expect(result.progress.awardedQuestionIds?.[lessonA.id]).toEqual(['qA']);
  });

  it('does not award duplicate lesson XP', () => {
    const progress: LessonProgress = {
      completedLessonIds: [lessonA.id],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 125,
    };

    const result = completeLessonInProgress(
      progress,
      lessonA.id,
      getLessonQuestionIds(lessonA),
      '2026-06-23',
    );

    expect(result.award.alreadyCompleted).toBe(true);
    expect(result.award.totalXpGained).toBe(0);
    expect(result.award.coinsGained).toBe(0);
    expect(result.progress.totalXp).toBe(125);
  });

  it('clears saved partial progress when a lesson is completed', () => {
    const progress: LessonProgress = {
      completedLessonIds: [],
      dailyCompletionDates: [],
      lessonResumeStates: {
        [lessonA.id]: {
          questionStates: {
            qA: {
              answerResult: null,
              selectedOptionId: 'wrong',
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
      lessonA.id,
      getLessonQuestionIds(lessonA),
      '2026-06-23',
    );

    expect(result.progress.lessonResumeStates?.[lessonA.id]).toBeUndefined();
  });

  it('scales the daily bonus with the current streak length', () => {
    const progress: LessonProgress = {
      completedLessonIds: [lessonA.id],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 125,
    };

    const questionIds = getLessonQuestionIds(lessonB);
    const result = completeLessonInProgress(progress, lessonB.id, questionIds, '2026-06-24');
    const expectedLessonXp = questionIds.length * questionCompletionXp;

    expect(result.award.dailyBonusXp).toBe(dailyStreakBonusXp * 2);
    expect(result.award.totalXpGained).toBe(expectedLessonXp + dailyStreakBonusXp * 2);
    expect(result.progress.totalXp).toBe(125 + expectedLessonXp + dailyStreakBonusXp * 2);
    // Coins ignore the (doubled) streak bonus entirely: per-answer coins + flat.
    expect(result.award.coinsGained).toBe(
      questionIds.length * coinsPerCorrectAnswer + lessonCompletionCoinBonus,
    );
  });

  it('does not award a second daily bonus on the same day', () => {
    const progress: LessonProgress = {
      completedLessonIds: [lessonA.id],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 125,
    };

    const questionIds = getLessonQuestionIds(lessonB);
    const result = completeLessonInProgress(progress, lessonB.id, questionIds, '2026-06-23');
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
      completedLessonIds: [lessonA.id],
      dailyCompletionDates: ['2026-06-23'],
      dailyStudyMinutes: {
        '2026-06-23': 4,
      },
      totalXp: 125,
    };

    const result = addDailyStudyMinutesInProgress(progress, '2026-06-23', 125_000);

    expect(result.dailyStudyMinutes?.['2026-06-23']).toBe(6);
    expect(result.completedLessonIds).toEqual([lessonA.id]);
    expect(result.totalXp).toBe(125);
  });

  it('merges remote and local progress without reopening completed lessons', () => {
    const remoteProgress: LessonProgress = {
      awardedQuestionIds: {
        [lessonA.id]: ['qA'],
      },
      completedLessonIds: [lessonA.id],
      dailyCompletionDates: ['2026-06-22'],
      dailyStudyMinutes: {
        '2026-06-22': 4,
      },
      lessonResumeStates: {
        [lessonA.id]: {
          questionStates: {},
          stepIndex: 2,
        },
      },
      totalXp: 125,
    };
    const localProgress: LessonProgress = {
      awardedQuestionIds: {
        [lessonB.id]: ['qD'],
      },
      completedLessonIds: [],
      dailyCompletionDates: ['2026-06-23'],
      dailyStudyMinutes: {
        '2026-06-22': 2,
        '2026-06-23': 7,
      },
      lessonResumeStates: {
        [lessonB.id]: {
          questionStates: {},
          stepIndex: 1,
        },
      },
      totalXp: 20,
    };

    const mergedProgress = mergeLessonProgress(remoteProgress, localProgress);

    expect(mergedProgress.completedLessonIds).toEqual([lessonA.id]);
    expect(mergedProgress.dailyCompletionDates).toEqual(['2026-06-22', '2026-06-23']);
    expect(mergedProgress.dailyStudyMinutes).toEqual({
      '2026-06-22': 4,
      '2026-06-23': 7,
    });
    expect(mergedProgress.lessonResumeStates?.[lessonA.id]).toBeUndefined();
    expect(mergedProgress.lessonResumeStates?.[lessonB.id]?.stepIndex).toBe(1);
    expect(mergedProgress.totalXp).toBe(125);
  });

  it('detects equivalent progress regardless of map key order', () => {
    const leftProgress: LessonProgress = {
      completedLessonIds: [lessonA.id],
      dailyCompletionDates: ['2026-06-23'],
      dailyStudyMinutes: {
        '2026-06-23': 6,
        '2026-06-22': 4,
      },
      totalXp: 125,
    };
    const rightProgress: LessonProgress = {
      completedLessonIds: [lessonA.id],
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
      completedLessonIds: [lessonA.id],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 125,
    };
    const localProgress: LessonProgress = {
      completedLessonIds: [lessonA.id],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 125,
    };
    const mergedProgress = mergeLessonProgress(remoteProgress, localProgress);

    expect(shouldSaveMergedProgress(remoteProgress, localProgress, mergedProgress)).toBe(false);
  });

  it('saves merged progress when local progress adds data missing from Firestore', () => {
    const remoteProgress: LessonProgress = {
      completedLessonIds: [lessonA.id],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 125,
    };
    const localProgress: LessonProgress = {
      completedLessonIds: [lessonA.id, lessonB.id],
      dailyCompletionDates: ['2026-06-23', '2026-06-24'],
      totalXp: 250,
    };
    const mergedProgress = mergeLessonProgress(remoteProgress, localProgress);

    expect(shouldSaveMergedProgress(remoteProgress, localProgress, mergedProgress)).toBe(true);
  });
});

describe('chapter progress', () => {
  it('summarizes completion within a chapter', () => {
    const chapterLessons = [lessonA, lessonB];
    const progress = getChapterLessonProgress(chapterLessons, ['lesson-a']);

    expect(progress).toEqual({
      totalLessons: 2,
      completedLessons: 1,
      percentComplete: 50,
      isComplete: false,
      isStarted: true,
      hasLessons: true,
    });
  });

  it('marks a chapter complete only when every lesson is done', () => {
    const chapterLessons = [lessonA, lessonB];
    const progress = getChapterLessonProgress(chapterLessons, ['lesson-a', 'lesson-b']);

    expect(progress.completedLessons).toBe(2);
    expect(progress.percentComplete).toBe(100);
    expect(progress.isComplete).toBe(true);
  });

  it('handles an empty chapter without dividing by zero', () => {
    const progress = getChapterLessonProgress([], ['lesson-a']);

    expect(progress).toEqual({
      totalLessons: 0,
      completedLessons: 0,
      percentComplete: 0,
      isComplete: false,
      isStarted: false,
      hasLessons: false,
    });
  });

  it('unlocks chapter practice once one lesson in the chapter is complete', () => {
    const chapterLessons = [lessonA, lessonB];

    expect(isChapterPracticeAvailable(chapterLessons, [])).toBe(false);
    expect(isChapterPracticeAvailable(chapterLessons, ['lesson-a'])).toBe(true);
    // A completion in another chapter does not unlock this chapter's practice.
    expect(isChapterPracticeAvailable(chapterLessons, ['lesson-c'])).toBe(false);
  });

  it('never unlocks practice for a chapter with no lessons', () => {
    expect(isChapterPracticeAvailable([], ['lesson-a'])).toBe(false);
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
  it('uses a steeper progressive curve where each level costs 150 XP more than the last', () => {
    expect(xpBasePerLevel).toBe(250);
    expect(xpLevelStep).toBe(150);
    expect(getXpForLevel(1)).toBe(250);
    expect(getXpForLevel(2)).toBe(400);
    expect(getXpForLevel(3)).toBe(550);
  });

  it('maps total XP onto the progressive leveling curve at the boundaries', () => {
    expect(getXpLevel(0)).toEqual({
      level: 1,
      xpIntoLevel: 0,
      xpForLevel: 250,
      xpToNextLevel: 250,
      currentLevelFloor: 0,
      nextLevelThreshold: 250,
      progress: 0,
    });
    // Just shy of Level 2: the first level now costs 250 XP, not 100.
    expect(getXpLevel(249)).toEqual({
      level: 1,
      xpIntoLevel: 249,
      xpForLevel: 250,
      xpToNextLevel: 1,
      currentLevelFloor: 0,
      nextLevelThreshold: 250,
      progress: 249 / 250,
    });
    expect(getXpLevel(250)).toEqual({
      level: 2,
      xpIntoLevel: 0,
      xpForLevel: 400,
      xpToNextLevel: 400,
      currentLevelFloor: 250,
      nextLevelThreshold: 650,
      progress: 0,
    });
    // Halfway through Level 2 (250 floor + 200 of the 400 needed for Level 3).
    expect(getXpLevel(450)).toEqual({
      level: 2,
      xpIntoLevel: 200,
      xpForLevel: 400,
      xpToNextLevel: 200,
      currentLevelFloor: 250,
      nextLevelThreshold: 650,
      progress: 0.5,
    });
    expect(getXpLevel(650)).toEqual({
      level: 3,
      xpIntoLevel: 0,
      xpForLevel: 550,
      xpToNextLevel: 550,
      currentLevelFloor: 650,
      nextLevelThreshold: 1200,
      progress: 0,
    });
  });

  it('treats negative or invalid XP as zero', () => {
    expect(getXpLevel(-20)).toEqual({
      level: 1,
      xpIntoLevel: 0,
      xpForLevel: 250,
      xpToNextLevel: 250,
      currentLevelFloor: 0,
      nextLevelThreshold: 250,
      progress: 0,
    });
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
      awardedQuestionIds: { 'lesson-a': ['a', 'b', 'c'] },
    });

    // 3 awarded questions, 0 recorded submissions → 3/3 = 100% (not 0%).
    expect(getOverallAccuracy(progress)).toBe(100);
  });

  it('stays consistent with the attempted and answered-correctly counts', () => {
    const progress = baseProgress({
      questionAttempts: { q1: { correct: 1, incorrect: 1 } },
      awardedQuestionIds: { 'lesson-a': ['a'] },
    });

    // attempted = 2 submissions + 1 awarded = 3; correct = 1 + 1 = 2 → 67%.
    expect(getQuestionsAttemptedCount(progress)).toBe(3);
    expect(getQuestionsAnsweredCorrectlyCount(progress)).toBe(2);
    expect(getOverallAccuracy(progress)).toBe(67);
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
    const questionIds = getLessonQuestionIds(lessonA);
    const result = completeLessonInProgress(baseProgress(), lessonA.id, questionIds, '2026-06-23');

    expect(questionIds.length).toBeGreaterThan(0);
    expect(getQuestionsAttemptedCount(result.progress)).toBe(questionIds.length);
    expect(getQuestionsAnsweredCorrectlyCount(result.progress)).toBe(questionIds.length);
  });

  it('does not double-count a question already answered in the lesson player', () => {
    const questionIds = getLessonQuestionIds(lessonA);
    // Simulate the player: the first question was answered (attempt recorded) and awarded.
    let progress = recordQuestionAttemptInProgress(baseProgress(), questionIds[0], true);
    progress = awardQuestionInProgress(progress, lessonA.id, questionIds[0]).progress;

    const result = completeLessonInProgress(progress, lessonA.id, questionIds, '2026-06-23');

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
    /* Coins come ONLY from the correct answer, never from today's streak bonus. */
    expect(result.award.coinsGained).toBe(coinsPerCorrectAnswer);
    expect(result.award.coinsGained).toBeLessThan(result.award.totalXpGained);
    expect(result.progress.totalXp).toBe(100 + practiceQuestionXp + dailyStreakBonusXp);
    // Lifetime coins grow only by the answer's coins (no streak coins).
    expect(result.progress.totalCoinsEarned).toBe(coinsPerCorrectAnswer);
    expect(result.progress.dailyCompletionDates).toContain(today);
  });

  it('skips the daily bonus on later answers the same day and gives no XP for a wrong answer', () => {
    const today = getTodayKey();
    const seeded = baseProgress({ totalXp: 0, dailyCompletionDates: [today] });

    const correctAgain = awardPracticeQuestionInProgress(seeded, true, today);
    expect(correctAgain.award.dailyBonusXp).toBe(0);
    expect(correctAgain.award.totalXpGained).toBe(practiceQuestionXp);
    // Later correct answers still earn the flat per-answer coins.
    expect(correctAgain.award.coinsGained).toBe(coinsPerCorrectAnswer);

    const wrong = awardPracticeQuestionInProgress(seeded, false, today);
    expect(wrong.award.questionXp).toBe(0);
    expect(wrong.award.totalXpGained).toBe(0);
    // A wrong answer earns no coins at all.
    expect(wrong.award.coinsGained).toBe(0);
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

  it('awards XP but NO coins when awardCoins is false (the race answer reward)', () => {
    const today = getTodayKey();
    /* Seed today so no streak bonus, isolating coins-vs-XP behaviour. */
    const result = awardPracticeQuestionInProgress(
      baseProgress({ totalXp: 0, dailyCompletionDates: [today] }),
      true,
      today,
      { awardCoins: false },
    );

    // XP is untouched by opting out of coins…
    expect(result.award.questionXp).toBe(practiceQuestionXp);
    expect(result.award.totalXpGained).toBe(practiceQuestionXp);
    expect(result.progress.totalXp).toBe(practiceQuestionXp);
    // …but the answer earns no coins and lifetime coins stay flat.
    expect(result.award.coinsGained).toBe(0);
    expect(result.progress.totalCoinsEarned).toBe(0);
  });

  it('still earns coins by default for practice (awardCoins defaults to true)', () => {
    const today = getTodayKey();
    const result = awardPracticeQuestionInProgress(
      baseProgress({ totalXp: 0, dailyCompletionDates: [today] }),
      true,
      today,
    );

    expect(result.award.coinsGained).toBe(coinsPerCorrectAnswer);
    expect(result.progress.totalCoinsEarned).toBe(coinsPerCorrectAnswer);
  });
});

describe('challenge question awards', () => {
  it('awards DOUBLE the practice XP and coins for a correct challenge answer', () => {
    const result = awardChallengeQuestionInProgress(
      baseProgress({ totalXp: 100, totalCoinsEarned: 7 }),
      true,
    );

    expect(result.award.correct).toBe(true);
    // Exactly double a normal practice answer (10 XP + 5 coins) → 20 XP + 10 coins.
    expect(result.award.xpGained).toBe(practiceQuestionXp * challengeRewardMultiplier);
    expect(result.award.coinsGained).toBe(coinsPerCorrectAnswer * challengeRewardMultiplier);
    expect(result.award.xpGained).toBe(20);
    expect(result.award.coinsGained).toBe(10);
    expect(result.progress.totalXp).toBe(120);
    expect(result.progress.totalCoinsEarned).toBe(17);
  });

  it('awards nothing for a wrong challenge answer and never touches the streak or history', () => {
    const today = getTodayKey();
    const result = awardChallengeQuestionInProgress(
      baseProgress({ totalXp: 50, totalCoinsEarned: 3, dailyCompletionDates: [] }),
      false,
    );

    expect(result.award.xpGained).toBe(0);
    expect(result.award.coinsGained).toBe(0);
    expect(result.progress.totalXp).toBe(50);
    expect(result.progress.totalCoinsEarned).toBe(3);
    /* Unlike the bank path: no streak and no attempt/topic recording — challenge
     * answers only move lifetime XP + coins. */
    expect(result.progress.dailyCompletionDates).not.toContain(today);
    expect(Object.keys(result.progress.questionAttempts ?? {})).toHaveLength(0);
    expect(result.progress.topicStats ?? {}).toEqual({});
  });
});

describe('coin economy', () => {
  it('uses a flat 5 coins per correct answer (any type) and a flat 15-coin lesson bonus', () => {
    // Flat 5 for every correct answer — lesson questions and practice alike...
    expect(coinsPerCorrectAnswer).toBe(5);
    // ...and a flat 15-coin lesson-completion bonus.
    expect(lessonCompletionCoinBonus).toBe(15);
    // Coins are fewer than the XP a correct answer grants (lesson or practice).
    expect(coinsPerCorrectAnswer).toBeLessThan(questionCompletionXp);
    expect(coinsPerCorrectAnswer).toBeLessThan(practiceQuestionXp);
  });

  it('awards the same flat coins for a lesson question and a practice question', () => {
    const lessonAnswer = awardQuestionInProgress(baseProgress(), lessonA.id, 'qA');
    const practiceAnswer = awardPracticeQuestionInProgress(baseProgress(), true, getTodayKey());

    expect(lessonAnswer.coinsGained).toBe(coinsPerCorrectAnswer);
    expect(practiceAnswer.award.coinsGained).toBe(coinsPerCorrectAnswer);
    expect(lessonAnswer.coinsGained).toBe(practiceAnswer.award.coinsGained);
  });

  it('never grants coins for the daily streak bonus (practice)', () => {
    // First activity of the day → a streak bonus is granted in XP...
    const result = awardPracticeQuestionInProgress(
      baseProgress({ totalXp: 0, dailyCompletionDates: [] }),
      true,
      getTodayKey(),
    );

    expect(result.award.dailyBonusXp).toBeGreaterThan(0);
    // ...but coins ignore it entirely.
    expect(result.award.coinsGained).toBe(coinsPerCorrectAnswer);
    expect(result.progress.totalCoinsEarned).toBe(coinsPerCorrectAnswer);
  });

  it('adds a flat coin bonus on lesson completion, on top of per-question coins', () => {
    const questionIds = getLessonQuestionIds(lessonA);
    const result = completeLessonInProgress(baseProgress(), lessonA.id, questionIds, '2026-06-23');

    const perQuestionCoins = questionIds.length * coinsPerCorrectAnswer;
    expect(result.award.coinsGained).toBe(perQuestionCoins + lessonCompletionCoinBonus);
    // The flat bonus is independent of (added on top of) the per-question coins.
    expect(result.award.coinsGained - perQuestionCoins).toBe(lessonCompletionCoinBonus);
    expect(result.progress.totalCoinsEarned).toBe(perQuestionCoins + lessonCompletionCoinBonus);
  });

  it('accumulates lifetime coins across a practice answer and a lesson completion', () => {
    const afterPractice = awardPracticeQuestionInProgress(
      baseProgress(),
      true,
      getTodayKey(),
    ).progress;

    const questionIds = getLessonQuestionIds(lessonB);
    const afterLesson = completeLessonInProgress(
      afterPractice,
      lessonB.id,
      questionIds,
      getTodayKey(),
    );

    const practiceCoins = coinsPerCorrectAnswer;
    const lessonCoins = questionIds.length * coinsPerCorrectAnswer + lessonCompletionCoinBonus;

    expect(afterLesson.progress.totalCoinsEarned).toBe(practiceCoins + lessonCoins);
  });

  it('does not re-grant per-question coins already earned in the lesson player', () => {
    // Answer the lesson's questions one-by-one (player flow), then complete it.
    const questionIds = getLessonQuestionIds(lessonA);
    let progress = baseProgress();
    for (const questionId of questionIds) {
      progress = awardQuestionInProgress(progress, lessonA.id, questionId).progress;
    }

    const perQuestionCoins = questionIds.length * coinsPerCorrectAnswer;
    expect(progress.totalCoinsEarned).toBe(perQuestionCoins);

    const result = completeLessonInProgress(progress, lessonA.id, questionIds, '2026-06-23');

    // Completion adds only the flat bonus on top — questions aren't double-paid.
    expect(result.progress.totalCoinsEarned).toBe(perQuestionCoins + lessonCompletionCoinBonus);
    // The reported award still reflects the lesson's full coin value.
    expect(result.award.coinsGained).toBe(perQuestionCoins + lessonCompletionCoinBonus);
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
    progress = recordLessonTimeInProgress(progress, 'lesson-a', 125_000);
    progress = recordLessonTimeInProgress(progress, 'lesson-a', 60_000);

    expect(progress.lessonTimeSpentMs?.['lesson-a']).toBe(185_000);
    expect(getLessonTimeMinutes(progress, 'lesson-a')).toBe(3);
    expect(getLessonTimeMinutes(progress, 'missing')).toBe(0);
  });

  it('ignores non-positive elapsed time', () => {
    expect(recordLessonTimeInProgress(baseProgress(), 'lesson-a', 0).lessonTimeSpentMs).toEqual({});
  });

  it('records study time into both daily minutes and per-lesson totals', () => {
    const progress = addStudyTimeInProgress(baseProgress(), '2026-06-23', 'lesson-a', 125_000);

    expect(progress.dailyStudyMinutes?.['2026-06-23']).toBe(2);
    expect(progress.lessonTimeSpentMs?.['lesson-a']).toBe(125_000);
  });
});

describe('completion timestamps', () => {
  it('records the first-completion timestamp once and never overwrites it', () => {
    const questionIds = getLessonQuestionIds(lessonA);
    const first = completeLessonInProgress(
      baseProgress(),
      lessonA.id,
      questionIds,
      '2026-06-23',
      '2026-06-23T10:00:00.000Z',
    );

    expect(first.progress.lessonCompletedAt?.[lessonA.id]).toBe('2026-06-23T10:00:00.000Z');

    const second = completeLessonInProgress(
      first.progress,
      lessonA.id,
      questionIds,
      '2026-06-24',
      '2026-06-24T10:00:00.000Z',
    );

    expect(second.progress.lessonCompletedAt?.[lessonA.id]).toBe('2026-06-23T10:00:00.000Z');
  });

  it('keeps a pre-existing timestamp when first completing a lesson', () => {
    const progress = baseProgress({
      lessonCompletedAt: { 'lesson-a': '2026-06-01T00:00:00.000Z' },
    });

    const result = completeLessonInProgress(
      progress,
      lessonA.id,
      getLessonQuestionIds(lessonA),
      '2026-06-23',
      '2026-06-23T10:00:00.000Z',
    );

    expect(result.progress.lessonCompletedAt?.[lessonA.id]).toBe('2026-06-01T00:00:00.000Z');
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
      lessonTimeSpentMs: { 'lesson-a': 120_000 },
      lessonCompletedAt: { 'lesson-a': '2026-06-10T00:00:00.000Z' },
    });
    const localProgress: LessonProgress = baseProgress({
      questionAttempts: {
        q1: { correct: 1, incorrect: 3 },
        q3: { correct: 1, incorrect: 0 },
      },
      lessonTimeSpentMs: { 'lesson-a': 90_000, 'lesson-b': 30_000 },
      lessonCompletedAt: { 'lesson-a': '2026-06-05T00:00:00.000Z' },
    });

    const merged = mergeLessonProgress(remoteProgress, localProgress);

    expect(merged.questionAttempts).toEqual({
      q1: { correct: 2, incorrect: 3 },
      q2: { correct: 0, incorrect: 1 },
      q3: { correct: 1, incorrect: 0 },
    });
    expect(merged.lessonTimeSpentMs).toEqual({
      'lesson-a': 120_000,
      'lesson-b': 30_000,
    });
    expect(merged.lessonCompletedAt).toEqual({ 'lesson-a': '2026-06-05T00:00:00.000Z' });
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
      completedLessonIds: ['lesson-a'],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 125,
    } as LessonProgress;

    const normalized = mergeLessonProgress(baseProgress(), legacyProgress);

    expect(normalized.questionAttempts).toEqual({});
    expect(normalized.lessonCompletedAt).toEqual({});
    expect(normalized.lessonTimeSpentMs).toEqual({});
    expect(normalized.completedLessonIds).toEqual(['lesson-a']);
    expect(normalized.totalXp).toBe(125);
  });
});

describe('response recording', () => {
  function responseContext(overrides: Partial<ResponseContext> = {}): ResponseContext {
    return {
      questionId: 'q1',
      isCorrect: false,
      source: 'lesson',
      chapterId: 'functions-and-graphs',
      prompt: 'What is the slope of y = 2x?',
      chosenChoiceId: 'wrong',
      chosenLabel: 'Wrong choice',
      correctLabel: 'Right choice',
      ...overrides,
    };
  }

  it('keys lesson answers by lessonId and unifies practice into the same lesson topic', () => {
    /* A practice question resolves (chapterId, category) → lessonId, so lesson +
     * practice share a key. */
    const sampleQuestion = questionBank[0];
    const lessonId = sampleQuestion.lessonId as string;
    expect(lessonId).toBeTruthy();

    // Lesson answers carry their lessonId and key directly by it.
    expect(
      getTopicKey(
        responseContext({ source: 'lesson', chapterId: sampleQuestion.chapterId, lessonId }),
      ),
    ).toBe(lessonId);

    /* Practice answers (no lessonId) resolve to the SAME lessonId, unifying both
     * sources under one per-lesson topic. */
    expect(
      getTopicKey(
        responseContext({
          source: 'practice',
          chapterId: sampleQuestion.chapterId,
          category: sampleQuestion.category,
        }),
      ),
    ).toBe(lessonId);
  });

  it('falls back to chapter/category and chapter keys when no lesson resolves', () => {
    // An unknown practice category keeps lesson-topic granularity (chapter/category).
    expect(
      getTopicKey(
        responseContext({ source: 'practice', chapterId: 'limits', category: 'made-up-topic' }),
      ),
    ).toBe('limits/made-up-topic');
    // A lesson answer with neither lessonId nor category falls back to the chapter.
    expect(getTopicKey(responseContext({ source: 'lesson', chapterId: 'limits' }))).toBe('limits');
    // An empty category is treated as absent and falls back to the chapter id.
    expect(getTopicKey(responseContext({ chapterId: 'limits', category: '' }))).toBe('limits');
  });

  it('records a correct lesson response: attempts + topicStats, no mistake added', () => {
    const progress = recordResponseInProgress(
      baseProgress(),
      responseContext({ isCorrect: true }),
    );

    expect(progress.questionAttempts?.['q1']).toEqual({ correct: 1, incorrect: 0 });
    expect(progress.topicStats?.['functions-and-graphs']).toEqual({ correct: 1, incorrect: 0 });
    expect(progress.recentMistakes).toEqual([]);
  });

  it('records a wrong lesson response and prepends a recent mistake', () => {
    const progress = recordResponseInProgress(
      baseProgress(),
      responseContext({ isCorrect: false }),
      '2026-06-25T10:00:00.000Z',
    );

    expect(progress.questionAttempts?.['q1']).toEqual({ correct: 0, incorrect: 1 });
    expect(progress.topicStats?.['functions-and-graphs']).toEqual({ correct: 0, incorrect: 1 });
    expect(progress.recentMistakes).toEqual([
      {
        questionId: 'q1',
        topicKey: 'functions-and-graphs',
        prompt: 'What is the slope of y = 2x?',
        chosenLabel: 'Wrong choice',
        correctLabel: 'Right choice',
        at: '2026-06-25T10:00:00.000Z',
      },
    ]);
  });

  it('rolls a lesson answer and a practice answer for the same lesson into one topic', () => {
    const sampleQuestion = questionBank[0];
    const lessonId = sampleQuestion.lessonId as string;

    // A correct LESSON answer for the lesson...
    let progress = recordResponseInProgress(
      baseProgress(),
      responseContext({
        source: 'lesson',
        chapterId: sampleQuestion.chapterId,
        lessonId,
        isCorrect: true,
      }),
    );
    // ...and a wrong PRACTICE answer in that same lesson's category.
    progress = recordResponseInProgress(
      progress,
      responseContext({
        source: 'practice',
        chapterId: sampleQuestion.chapterId,
        category: sampleQuestion.category,
        isCorrect: false,
        questionId: 'q2',
      }),
    );

    // Both unify under the single per-lesson topicKey (the lessonId).
    expect(progress.topicStats?.[lessonId]).toEqual({ correct: 1, incorrect: 1 });
    // The wrong practice answer is the only recorded mistake, tagged with the lesson.
    expect(progress.recentMistakes).toHaveLength(1);
    expect(progress.recentMistakes?.[0].questionId).toBe('q2');
    expect(progress.recentMistakes?.[0].topicKey).toBe(lessonId);
  });

  it('reuses the attempt recorder so accuracy analytics stay consistent', () => {
    let progress = recordResponseInProgress(baseProgress(), responseContext({ isCorrect: true }));
    progress = recordResponseInProgress(progress, responseContext({ isCorrect: false }));

    // Identical shape to what recordQuestionAttemptInProgress produces for q1.
    expect(progress.questionAttempts?.['q1']).toEqual({ correct: 1, incorrect: 1 });
    expect(getQuestionsAttemptedCount(progress)).toBe(2);
    expect(getQuestionsAnsweredCorrectlyCount(progress)).toBe(1);
    expect(getOverallAccuracy(progress)).toBe(50);
  });

  it('caps recentMistakes at 25, keeping the newest first (FIFO drop oldest)', () => {
    let progress = baseProgress();
    for (let index = 0; index < 30; index += 1) {
      progress = recordResponseInProgress(
        progress,
        responseContext({ questionId: `q${index}`, isCorrect: false, prompt: `prompt ${index}` }),
        // Ascending timestamps so the last-recorded mistake (q29) is the newest.
        `2026-06-25T10:${String(index).padStart(2, '0')}:00.000Z`,
      );
    }

    expect(progress.recentMistakes).toHaveLength(recentMistakesLimit);
    // Newest-first: the most recent submission is at the front, oldest kept is q5.
    expect(progress.recentMistakes?.[0].questionId).toBe('q29');
    expect(progress.recentMistakes?.[recentMistakesLimit - 1].questionId).toBe('q5');
    // The 5 oldest (q0–q4) were dropped by the cap.
    expect(progress.recentMistakes?.some((mistake) => mistake.questionId === 'q0')).toBe(false);
  });

  it('keeps the existing mistake history untouched on a correct answer', () => {
    let progress = recordResponseInProgress(baseProgress(), responseContext({ isCorrect: false }));
    progress = recordResponseInProgress(
      progress,
      responseContext({ isCorrect: true, questionId: 'q2' }),
    );

    expect(progress.recentMistakes).toHaveLength(1);
    expect(progress.recentMistakes?.[0].questionId).toBe('q1');
    // Both responses still tally into the shared topic counters.
    expect(progress.topicStats?.['functions-and-graphs']).toEqual({ correct: 1, incorrect: 1 });
  });
});

describe('merging response history', () => {
  function mistake(overrides: Partial<RecentMistake> & Pick<RecentMistake, 'questionId' | 'at'>): RecentMistake {
    return {
      topicKey: 'limits',
      prompt: 'prompt',
      chosenLabel: 'b',
      correctLabel: 'a',
      ...overrides,
    };
  }

  it('max-merges topicStats and unions recentMistakes by recency, deduped', () => {
    const remoteProgress = baseProgress({
      topicStats: {
        'functions-and-graphs': { correct: 3, incorrect: 1 },
        limits: { correct: 0, incorrect: 2 },
      },
      recentMistakes: [
        mistake({ questionId: 'q2', at: '2026-06-20T00:00:00.000Z' }),
        mistake({ questionId: 'q1', at: '2026-06-18T00:00:00.000Z' }),
      ],
    });
    const localProgress = baseProgress({
      topicStats: {
        'functions-and-graphs': { correct: 1, incorrect: 4 },
        derivatives: { correct: 2, incorrect: 0 },
      },
      recentMistakes: [
        mistake({ questionId: 'q3', topicKey: 'derivatives', at: '2026-06-22T00:00:00.000Z' }),
        // Duplicate of remote q2 (same questionId + at) → must be deduped.
        mistake({ questionId: 'q2', at: '2026-06-20T00:00:00.000Z' }),
      ],
    });

    const merged = mergeLessonProgress(remoteProgress, localProgress);

    expect(merged.topicStats).toEqual({
      'functions-and-graphs': { correct: 3, incorrect: 4 },
      limits: { correct: 0, incorrect: 2 },
      derivatives: { correct: 2, incorrect: 0 },
    });
    // Newest-first and deduped: q3 (06-22), q2 (06-20), q1 (06-18).
    expect(merged.recentMistakes?.map((entry) => entry.questionId)).toEqual(['q3', 'q2', 'q1']);
  });

  it('caps merged recentMistakes at the 25 newest entries', () => {
    const remoteProgress = baseProgress({
      recentMistakes: Array.from({ length: 20 }, (_unused, index) =>
        mistake({ questionId: `q${index}`, at: `2026-06-25T10:${String(index).padStart(2, '0')}:00.000Z` }),
      ),
    });
    const localProgress = baseProgress({
      recentMistakes: Array.from({ length: 20 }, (_unused, index) =>
        mistake({
          questionId: `q${index + 20}`,
          at: `2026-06-25T10:${String(index + 20).padStart(2, '0')}:00.000Z`,
        }),
      ),
    });

    const merged = mergeLessonProgress(remoteProgress, localProgress);

    expect(merged.recentMistakes).toHaveLength(recentMistakesLimit);
    // The single newest entry (q39) leads; the oldest 15 fall off the cap.
    expect(merged.recentMistakes?.[0].questionId).toBe('q39');
    expect(merged.recentMistakes?.some((entry) => entry.questionId === 'q14')).toBe(false);
  });

  it('normalizes malformed topicStats and recentMistakes defensively', () => {
    const malformedLocal = {
      completedLessonIds: [],
      dailyCompletionDates: [],
      totalXp: 0,
      topicStats: {
        good: { correct: 2, incorrect: -1 },
        empty: { correct: 0, incorrect: 0 },
        bad: 'nope',
      },
      recentMistakes: [
        mistake({ questionId: 'q1', at: '2026-06-20T00:00:00.000Z' }),
        // Missing the required ISO `at` → dropped.
        { questionId: 'q2', topicKey: 'limits', prompt: 'p', chosenLabel: 'b', correctLabel: 'a' },
        'nope',
      ],
    } as unknown as LessonProgress;

    const merged = mergeLessonProgress(baseProgress(), malformedLocal);

    expect(merged.topicStats).toEqual({ good: { correct: 2, incorrect: 0 } });
    expect(merged.recentMistakes).toEqual([
      mistake({ questionId: 'q1', at: '2026-06-20T00:00:00.000Z' }),
    ]);
  });

  it('loads legacy progress without the new history fields', () => {
    const legacyProgress = {
      completedLessonIds: ['lesson-a'],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 125,
    } as LessonProgress;

    const normalized = mergeLessonProgress(baseProgress(), legacyProgress);

    expect(normalized.topicStats).toEqual({});
    expect(normalized.recentMistakes).toEqual([]);
  });
});
