import { describe, expect, it } from 'vitest';
import { createSeededRng, type PracticeQuestion } from '../data/questionBank';
import { dateKeyToDayNumber, dayNumberToDateKey } from './dayMath';
import { getTodayKey, type LessonProgress } from './lessonProgress';
import { buildRequiredPracticeSet } from './practiceSelection';

const TODAY = '2026-06-01';
const todayDay = dateKeyToDayNumber(TODAY) as number;

/** A lessonCompletedAt ISO for a date key at LOCAL noon, so its LOCAL calendar day
 *  equals dateKey in any runner timezone — mirroring the app, which stores a UTC
 *  instant but buckets it by its LOCAL day (consistent with getTodayKey). A
 *  UTC-midnight anchor would shift a day in negative offsets like UTC-7. */
function completionIso(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
}

/** A completion anchor AT today (local) → NOT yet SR-due (first interval is +1 day). */
const todayIso = completionIso(TODAY);

/** A completion anchor `days` before TODAY (used to make a topic SR-due). */
function daysAgoIso(days: number): string {
  return completionIso(dayNumberToDateKey(todayDay - days) as string);
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
  /* REGRESSION for "lots of lessons completed YESTERDAY, but practice still has
   * only 25 questions". Uses the APP'S local-day mechanism: today = getTodayKey()
   * and completions anchored at YESTERDAY evening (local). With the local-day SR
   * anchor every yesterday lesson is due today, so the required set surfaces all of
   * them plus the weak/sub-60 coverage and grows well past 25. (With the old
   * UTC-date anchor, in a negative offset like UTC-7 those evening completions are
   * mis-bucketed as "today", nothing comes due, and the set collapses to ~the
   * sub-60 coverage only — far under 25.) */
  it('surfaces many lessons completed YESTERDAY (local) as SR-due + weak and exceeds 25', () => {
    const todayKey = getTodayKey();
    const todayNum = dateKeyToDayNumber(todayKey) as number;
    const yesterdayKey = dayNumberToDateKey(todayNum - 1) as string;
    // 22:00 the previous LOCAL day: its UTC date rolls to today in UTC-7, so this
    // exercises the exact local-vs-UTC anchor the fix corrects.
    const [yy, ym, yd] = yesterdayKey.split('-').map(Number);
    const yesterdayEveningIso = new Date(yy, ym - 1, yd, 22, 0, 0, 0).toISOString();

    // 30 topics finished yesterday with VARIED accuracy.
    const sub60Topics = Array.from({ length: 10 }, (_unused, index) => `SUB${index}`); // <60%
    const weakTopics = Array.from({ length: 10 }, (_unused, index) => `WEAK${index}`); // 60–80%
    const strongTopics = Array.from({ length: 10 }, (_unused, index) => `STRONG${index}`); // >=80%
    const allTopics = [...sub60Topics, ...weakTopics, ...strongTopics];

    const pool = allTopics.flatMap((topic) => topicQuestions(topic, 3));
    const progress = progressWith({
      completedLessonIds: allTopics,
      // Every topic completed yesterday evening → all SR-due today.
      lessonCompletedAt: Object.fromEntries(
        allTopics.map((topic) => [topic, yesterdayEveningIso]),
      ),
      topicStats: {
        ...Object.fromEntries(sub60Topics.map((topic) => [topic, { correct: 1, incorrect: 4 }])), // 20%
        ...Object.fromEntries(weakTopics.map((topic) => [topic, { correct: 7, incorrect: 3 }])), // 70%
        ...Object.fromEntries(strongTopics.map((topic) => [topic, { correct: 9, incorrect: 1 }])), // 90%
      },
    });

    const result = buildRequiredPracticeSet(progress, pool, {
      today: todayKey,
      rng: createSeededRng(42),
    });

    // GROWS past the ~20 static base / past 25 (>=1 per SR-due topic + sub-60 coverage).
    expect(result.questions.length).toBeGreaterThan(25);
    // Every yesterday lesson is SR-DUE today and served (none mis-bucketed to "today").
    expect(result.srTopicsServed).toHaveLength(allTopics.length);
    for (const topic of allTopics) {
      expect(result.srTopicsServed).toContain(topic);
    }
    // Guaranteed coverage: every sub-60 topic gets a question.
    for (const topic of sub60Topics) {
      expect(result.coverageTopics).toContain(topic);
    }
    // Weak topics (<80% = sub-60 + 60–80%) are represented — at least one each.
    const weakSet = new Set([...sub60Topics, ...weakTopics]);
    expect(countFromTopics(result.questions, weakSet)).toBeGreaterThanOrEqual(weakSet.size);
    // AI count is round(static / 4) (these AI questions also count toward the 85% gate).
    expect(result.recommendedAiCount).toBe(Math.round(result.questions.length / 4));
  });

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

  /* CORE of the "different problems on every retry" feature: a fresh rng per attempt
   * must re-draw DIFFERENT specific questions from the SAME topic banks, while the
   * selection CRITERIA (which topics, how many) stay identical. 10 SR-due topics
   * (3 questions each), unattempted so they are SR-due but not weak: the criteria pull
   * exactly ONE question per SR-due topic (coverage), and WHICH one depends on the
   * seed. Under the old fixed-order draw every seed pulled the same question. */
  it('re-randomizes the SPECIFIC questions drawn per attempt while keeping the SAME criteria', () => {
    const srTopics = Array.from({ length: 10 }, (_unused, index) => `S${index}`);
    const pool = srTopics.flatMap((topic) => topicQuestions(topic, 3));
    const progress = progressWith({
      completedLessonIds: srTopics,
      lessonCompletedAt: Object.fromEntries(srTopics.map((topic) => [topic, daysAgoIso(200)])),
    });

    const drawForS0 = new Set<string>();
    const setSignatures = new Set<string>();
    for (let seed = 1; seed <= 25; seed += 1) {
      const result = buildRequiredPracticeSet(progress, pool, {
        today: TODAY,
        rng: createSeededRng(seed),
      });

      // CRITERIA are seed-independent: every SR-due topic is served exactly once.
      expect(result.questions).toHaveLength(srTopics.length);
      expect([...result.srTopicsServed].sort()).toEqual([...srTopics].sort());
      for (const topic of srTopics) {
        expect(result.questions.filter((question) => question.lessonId === topic)).toHaveLength(1);
      }
      // Never pulls from outside the eligible banks.
      for (const question of result.questions) {
        expect(srTopics).toContain(question.lessonId);
      }
      expect(result.recommendedAiCount).toBe(Math.round(result.questions.length / 4));

      const s0Draw = result.questions.filter((question) => question.lessonId === 'S0');
      expect(s0Draw).toHaveLength(1);
      drawForS0.add(s0Draw[0].id);
      setSignatures.add(
        result.questions
          .map((question) => question.id)
          .sort()
          .join(','),
      );
    }

    // A fixed-order draw (the old bug) yields ONE id for S0 and ONE signature across
    // all seeds; the fix produces several — proving per-attempt randomization.
    expect(drawForS0.size).toBeGreaterThan(1);
    expect(setSignatures.size).toBeGreaterThan(1);
  });

  /* Resume-safety counterpart: within an attempt the draw is fixed, so the SAME seed
   * reproduces the SAME set (a persisted attempt rebuilt from its seed is identical). */
  it('is deterministic for a GIVEN seed so a single attempt is reproducible', () => {
    const srTopics = Array.from({ length: 10 }, (_unused, index) => `S${index}`);
    const pool = srTopics.flatMap((topic) => topicQuestions(topic, 3));
    const progress = progressWith({
      completedLessonIds: srTopics,
      lessonCompletedAt: Object.fromEntries(srTopics.map((topic) => [topic, daysAgoIso(200)])),
    });

    const first = buildRequiredPracticeSet(progress, pool, { today: TODAY, rng: createSeededRng(123) });
    const second = buildRequiredPracticeSet(progress, pool, { today: TODAY, rng: createSeededRng(123) });
    expect(second.questions.map((question) => question.id)).toEqual(
      first.questions.map((question) => question.id),
    );
  });

  /* Mixed criteria (sub-60 + weak + SR-due) still hold across attempts: two different
   * seeds keep the SAME served topics / coverage / counts, only the drawn ids change. */
  it('preserves coverage + quota criteria across different attempts (mixed topics)', () => {
    const sub60 = ['SUB1', 'SUB2'];
    const weak = ['WEAK1', 'WEAK2'];
    const srTopics = ['S1', 'S2'];
    const pool = [
      ...sub60.flatMap((topic) => topicQuestions(topic, 5)),
      ...weak.flatMap((topic) => topicQuestions(topic, 5)),
      ...srTopics.flatMap((topic) => topicQuestions(topic, 5)),
    ];
    const progress = progressWith({
      completedLessonIds: [...sub60, ...weak, ...srTopics],
      lessonCompletedAt: {
        ...Object.fromEntries(sub60.map((topic) => [topic, todayIso])),
        ...Object.fromEntries(weak.map((topic) => [topic, todayIso])),
        ...Object.fromEntries(srTopics.map((topic) => [topic, daysAgoIso(200)])),
      },
      topicStats: {
        ...Object.fromEntries(sub60.map((topic) => [topic, { correct: 1, incorrect: 4 }])), // 20%
        ...Object.fromEntries(weak.map((topic) => [topic, { correct: 7, incorrect: 3 }])), // 70%
      },
    });

    const attemptOne = buildRequiredPracticeSet(progress, pool, { today: TODAY, rng: createSeededRng(11) });
    const attemptTwo = buildRequiredPracticeSet(progress, pool, { today: TODAY, rng: createSeededRng(22) });

    // SAME criteria: identical served-topic / coverage sets and identical total count.
    expect([...attemptTwo.srTopicsServed].sort()).toEqual([...attemptOne.srTopicsServed].sort());
    expect([...attemptTwo.coverageTopics].sort()).toEqual([...attemptOne.coverageTopics].sort());
    expect(attemptTwo.questions.length).toBe(attemptOne.questions.length);
    for (const topic of sub60) {
      expect(attemptOne.coverageTopics).toContain(topic);
      expect(attemptTwo.coverageTopics).toContain(topic);
    }
    // DIFFERENT specific draw: the exact question ids are not identical.
    expect(attemptTwo.questions.map((question) => question.id)).not.toEqual(
      attemptOne.questions.map((question) => question.id),
    );
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
