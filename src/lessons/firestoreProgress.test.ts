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
      topicStats: {},
      recentMistakes: [],
      totalXp: 42,
      totalCoinsEarned: 0,
    });
  });

  it('round-trips the new analytics fields and drops malformed entries', () => {
    const progress = normalizeFirestoreLessonProgress({
      completedLessonIds: ['what-changes'],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 145,
      totalCoinsEarned: 73.6,
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
    // Lifetime coins earned round-trips like XP: floored, clamped non-negative.
    expect(progress.totalCoinsEarned).toBe(73);
  });

  it('defaults malformed or missing lifetime coins earned to zero', () => {
    expect(normalizeFirestoreLessonProgress({ totalCoinsEarned: -5 }).totalCoinsEarned).toBe(0);
    expect(normalizeFirestoreLessonProgress({ totalCoinsEarned: 'nope' }).totalCoinsEarned).toBe(0);
    expect(normalizeFirestoreLessonProgress({}).totalCoinsEarned).toBe(0);
  });

  it('round-trips topicStats and recentMistakes and drops malformed entries', () => {
    const progress = normalizeFirestoreLessonProgress({
      completedLessonIds: ['what-changes'],
      dailyCompletionDates: ['2026-06-23'],
      totalXp: 50,
      topicStats: {
        'functions-and-graphs': { correct: 3, incorrect: 1.9 },
        empty: { correct: 0, incorrect: 0 },
        invalid: 'nope',
      },
      recentMistakes: [
        {
          questionId: 'table-change',
          topicKey: 'functions-and-graphs',
          prompt: 'What changed?',
          chosenLabel: 'Wrong',
          correctLabel: 'Right',
          at: '2026-06-23T10:00:00.000Z',
        },
        // Missing the required ISO `at` → dropped.
        {
          questionId: 'no-timestamp',
          topicKey: 'limits',
          prompt: 'p',
          chosenLabel: 'b',
          correctLabel: 'a',
        },
        'nope',
      ],
    });

    // Counters floor/clamp and empty/invalid topic entries are dropped.
    expect(progress.topicStats).toEqual({
      'functions-and-graphs': { correct: 3, incorrect: 1 },
    });
    expect(progress.recentMistakes).toEqual([
      {
        questionId: 'table-change',
        topicKey: 'functions-and-graphs',
        prompt: 'What changed?',
        chosenLabel: 'Wrong',
        correctLabel: 'Right',
        at: '2026-06-23T10:00:00.000Z',
      },
    ]);
  });

  it('caps a recentMistakes list loaded from Firestore at 25 entries', () => {
    const progress = normalizeFirestoreLessonProgress({
      recentMistakes: Array.from({ length: 40 }, (_unused, index) => ({
        questionId: `q${index}`,
        topicKey: 'limits',
        prompt: `p${index}`,
        chosenLabel: 'b',
        correctLabel: 'a',
        at: `2026-06-25T10:${String(index).padStart(2, '0')}:00.000Z`,
      })),
    });

    expect(progress.recentMistakes).toHaveLength(25);
    // Order is preserved (the list arrives newest-first from the app).
    expect(progress.recentMistakes?.[0].questionId).toBe('q0');
  });

  it('defaults missing topicStats and recentMistakes to empty containers', () => {
    const progress = normalizeFirestoreLessonProgress({});

    expect(progress.topicStats).toEqual({});
    expect(progress.recentMistakes).toEqual([]);
  });
});
