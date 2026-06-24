import { describe, expect, it } from 'vitest';
import { normalizeFirestoreLessonProgress } from './firestoreProgress';

describe('Firestore progress serialization', () => {
  it('normalizes progress loaded from Firestore', () => {
    const progress = normalizeFirestoreLessonProgress({
      awardedQuestionIds: {
        'what-changes': ['table-change', 'table-change', 4],
      },
      completedLessonIds: ['what-changes', 'what-changes', null],
      dailyCompletionDates: ['2026-06-23', '2026-06-23', false],
      dailyStudyMinutes: {
        '2026-06-23': 4.8,
        invalid: '10',
      },
      lessonResumeStates: {
        'slope-refresher': {
          questionStates: {
            'slope-meaning': {
              answerResult: 'incorrect',
              selectedOptionId: 'flat',
              showHint: 1,
            },
          },
          stepIndex: 2.6,
        },
      },
      totalXp: 42.9,
      updatedAt: { ignored: true },
    });

    expect(progress).toEqual({
      awardedQuestionIds: {
        'what-changes': ['table-change'],
      },
      completedLessonIds: ['what-changes'],
      dailyCompletionDates: ['2026-06-23'],
      dailyStudyMinutes: {
        '2026-06-23': 4,
      },
      lessonCompletedAt: {},
      lessonResumeStates: {
        'slope-refresher': {
          questionStates: {
            'slope-meaning': {
              answerResult: 'incorrect',
              selectedOptionId: 'flat',
              showHint: true,
            },
          },
          stepIndex: 2,
        },
      },
      lessonTimeSpentMs: {},
      questionAttempts: {},
      totalXp: 42,
    });
  });

  it('round-trips the new analytics fields and drops malformed entries', () => {
    const progress = normalizeFirestoreLessonProgress({
      completedLessonIds: ['what-changes'],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 145,
      questionAttempts: {
        'table-change': { correct: 2, incorrect: 1.9 },
        broken: { correct: 0, incorrect: 0 },
        invalid: 'nope',
      },
      lessonCompletedAt: {
        'what-changes': '2026-06-23T10:00:00.000Z',
        bad: 5,
      },
      lessonTimeSpentMs: {
        'what-changes': 185_000.7,
        negative: -10,
      },
    });

    expect(progress.questionAttempts).toEqual({ 'table-change': { correct: 2, incorrect: 1 } });
    expect(progress.lessonCompletedAt).toEqual({ 'what-changes': '2026-06-23T10:00:00.000Z' });
    expect(progress.lessonTimeSpentMs).toEqual({ 'what-changes': 185_000 });
  });
});
