import { describe, expect, it } from 'vitest';
import { createSeededRng, type PracticeQuestion } from '../data/questionBank';
import { dateKeyToDayNumber, dayNumberToDateKey } from './dayMath';
import type { LessonProgress } from './lessonProgress';
import { buildRequiredPracticeSet } from './practiceSelection';

const TODAY = '2026-06-01';
const todayDay = dateKeyToDayNumber(TODAY) as number;
const todayIso = `${TODAY}T00:00:00.000Z`;

/** An ISO completion anchor `days` before TODAY (used to make a topic SR-due). */
function daysAgoIso(days: number): string {
  return `${dayNumberToDateKey(todayDay - days)}T00:00:00.000Z`;
}

function makeQuestion(id: string, lessonId: string): PracticeQuestion {
  return {
    id,
    chapterId: 'chapter',
    lessonId,
    category: lessonId,
    prompt: `Prompt ${id}`,
    choices: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
    correctChoiceId: 'a',
    explanation: 'Because A.',
  };
}

function topicQuestions(lessonId: string, count: number): PracticeQuestion[] {
  return Array.from({ length: count }, (_unused, index) =>
    makeQuestion(`${lessonId}-q${index}`, lessonId),
  );
}

function progressWith(overrides: Partial<LessonProgress>): LessonProgress {
  return {
    completedLessonIds: [],
    dailyCompletionDates: [],
    totalXp: 0,
    ...overrides,
  };
}

function countFromTopics(questions: PracticeQuestion[], topics: Set<string>): number {
  return questions.filter((question) => question.lessonId != null && topics.has(question.lessonId))
    .length;
}

describe('buildRequiredPracticeSet', () => {
  it('hits >= 10 weak AND >= 10 SR-due questions when the pool allows', () => {
    const weakTopics = ['W1', 'W2', 'W3', 'W4', 'W5'];
    const srTopics = ['S1', 'S2', 'S3', 'S4', 'S5'];
    const pool = [
      ...weakTopics.flatMap((topic) => topicQuestions(topic, 3)),
      ...srTopics.flatMap((topic) => topicQuestions(topic, 3)),
    ];
    const progress = progressWith({
      completedLessonIds: [...weakTopics, ...srTopics],
      lessonCompletedAt: {
        // Weak topics anchored today → NOT SR-due (due tomorrow), only weak.
        ...Object.fromEntries(weakTopics.map((topic) => [topic, todayIso])),
        // SR topics anchored long ago → due now, and unattempted → not weak.
        ...Object.fromEntries(srTopics.map((topic) => [topic, daysAgoIso(200)])),
      },
      // Weak topics at 70% mastery (weak but not sub-60).
      topicStats: Object.fromEntries(
        weakTopics.map((topic) => [topic, { correct: 7, incorrect: 3 }]),
      ),
    });

    const result = buildRequiredPracticeSet(progress, pool, { today: TODAY, rng: createSeededRng(1) });

    expect(countFromTopics(result.questions, new Set(weakTopics))).toBeGreaterThanOrEqual(10);
    expect(countFromTopics(result.questions, new Set(srTopics))).toBeGreaterThanOrEqual(10);
    for (const topic of srTopics) {
      expect(result.srTopicsServed).toContain(topic);
    }
    // No question ever repeats.
    const ids = result.questions.map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
    // recommendedAiCount is exactly round(static / 4).
    expect(result.recommendedAiCount).toBe(Math.round(result.questions.length / 4));
  });

  it('guarantees one question for EVERY sub-60 topic (in coverageTopics)', () => {
    const sub60 = ['SUB1', 'SUB2', 'SUB3'];
    const pool = sub60.flatMap((topic) => topicQuestions(topic, 2));
    const progress = progressWith({
      completedLessonIds: sub60,
      lessonCompletedAt: Object.fromEntries(sub60.map((topic) => [topic, todayIso])),
      topicStats: {
        SUB1: { correct: 0, incorrect: 2 }, // 0%
        SUB2: { correct: 1, incorrect: 3 }, // 25%
        SUB3: { correct: 2, incorrect: 3 }, // 40%
      },
    });

    const result = buildRequiredPracticeSet(progress, pool, { today: TODAY, rng: createSeededRng(2) });

    for (const topic of sub60) {
      expect(result.coverageTopics).toContain(topic);
      expect(result.questions.some((question) => question.lessonId === topic)).toBe(true);
    }
  });

  it('guarantees one question for EVERY SR-due topic (recorded as served)', () => {
    const srTopics = ['S1', 'S2', 'S3'];
    const pool = srTopics.flatMap((topic) => topicQuestions(topic, 2));
    const progress = progressWith({
      completedLessonIds: srTopics,
      lessonCompletedAt: Object.fromEntries(srTopics.map((topic) => [topic, daysAgoIso(200)])),
    });

    const result = buildRequiredPracticeSet(progress, pool, { today: TODAY, rng: createSeededRng(3) });

    for (const topic of srTopics) {
      expect(result.srTopicsServed).toContain(topic);
      expect(result.questions.some((question) => question.lessonId === topic)).toBe(true);
    }
  });

  it('grows the set past 20 when there are many sub-60 and SR-due topics', () => {
    const sub60 = Array.from({ length: 12 }, (_unused, index) => `W${index}`);
    const srTopics = Array.from({ length: 12 }, (_unused, index) => `S${index}`);
    const pool = [
      ...sub60.flatMap((topic) => topicQuestions(topic, 1)),
      ...srTopics.flatMap((topic) => topicQuestions(topic, 1)),
    ];
    const progress = progressWith({
      completedLessonIds: [...sub60, ...srTopics],
      lessonCompletedAt: {
        ...Object.fromEntries(sub60.map((topic) => [topic, todayIso])),
        ...Object.fromEntries(srTopics.map((topic) => [topic, daysAgoIso(200)])),
      },
      topicStats: Object.fromEntries(sub60.map((topic) => [topic, { correct: 0, incorrect: 2 }])),
    });

    const result = buildRequiredPracticeSet(progress, pool, { today: TODAY, rng: createSeededRng(4) });

    // 12 sub-60 + 12 SR-due each guarantee coverage → well past any 20-question cap.
    expect(result.questions.length).toBeGreaterThan(20);
  });

  it('weights the weak quota toward LOWER mastery (inverse-mastery bias)', () => {
    const pool = [...topicQuestions('LOW', 25), ...topicQuestions('HIGH', 25)];
    const progress = progressWith({
      completedLessonIds: ['LOW', 'HIGH'],
      lessonCompletedAt: { LOW: todayIso, HIGH: todayIso },
      topicStats: {
        LOW: { correct: 3, incorrect: 2 }, // 60% → weight 0.20
        HIGH: { correct: 7, incorrect: 2 }, // ~78% → weight ~0.02
      },
    });

    const result = buildRequiredPracticeSet(progress, pool, {
      today: TODAY,
      rng: createSeededRng(123),
      weakTarget: 20,
    });

    const lowCount = result.questions.filter((question) => question.lessonId === 'LOW').length;
    const highCount = result.questions.filter((question) => question.lessonId === 'HIGH').length;
    expect(lowCount).toBeGreaterThan(highCount);
  });

  it('clamps each quota to the available pool and never repeats a question', () => {
    const pool = topicQuestions('W', 2); // a single weak topic with only two questions
    const progress = progressWith({
      completedLessonIds: ['W'],
      lessonCompletedAt: { W: todayIso },
      topicStats: { W: { correct: 1, incorrect: 4 } }, // 20% (weak + sub-60)
    });

    const result = buildRequiredPracticeSet(progress, pool, {
      today: TODAY,
      rng: createSeededRng(5),
      weakTarget: 10,
    });

    // Only two questions exist for the topic — the quota of 10 can't pad with repeats.
    expect(result.questions.length).toBe(2);
    const ids = result.questions.map((question) => question.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('keeps the gate passable for a fresh completer with nothing weak or due (baseline)', () => {
    const pool = topicQuestions('T', 5);
    const progress = progressWith({
      completedLessonIds: ['T'],
      lessonCompletedAt: { T: todayIso }, // not SR-due today, no attempts → not weak
    });

    const result = buildRequiredPracticeSet(progress, pool, { today: TODAY, rng: createSeededRng(6) });

    // The baseline top-up fills a sensible mixed review from the pool (clamped).
    expect(result.questions.length).toBe(5);
    expect(result.srTopicsServed).toEqual([]);
    // round(5 / 4) === 1.
    expect(result.recommendedAiCount).toBe(1);
  });
});
