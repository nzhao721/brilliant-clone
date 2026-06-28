/*
 * Builds the DAILY-REQUIRED mixed-practice set from a learner's completed-lesson
 * question pool. The set deliberately emphasizes (a) topics the learner is weak on
 * and (b) topics due for spaced-repetition review, while guaranteeing coverage of
 * every sub-60% topic and every SR-due topic. There is NO maximum size: the weak
 * and SR quotas (each >= 10 when the pool allows) plus per-topic coverage make the
 * set grow as needed. A general baseline keeps the gate passable when a learner
 * has nothing flagged yet.
 *
 * Pure + seeded-rng friendly so it is fully deterministic in tests.
 */

import type { PracticeQuestion, RandomNumberGenerator } from '../data/questionBank';
import type { LessonProgress } from './lessonProgress';
import { getTopicMastery, getTopicsBelowMastery } from './learnerProfile';
import { getSrDueTopics } from './spacedRepetition';

/** A topic is "weak" below this mastery (with >= 1 attempt). */
const WEAK_MASTERY_THRESHOLD = 0.8;
/** A topic is "sub-60" (guaranteed coverage) below this mastery (with >= 1 attempt). */
const SUB60_MASTERY_THRESHOLD = 0.6;
const DEFAULT_WEAK_TARGET = 10;
const DEFAULT_SR_TARGET = 10;
/* Minimum set size so the daily-required gate is always passable with a sensible
 * mixed review, even when the learner has no weak or SR-due topics yet. */
const DEFAULT_BASELINE_TARGET = 10;

/* Floor for the gate's AI challenge round so a SMALL required set still gets a
 * visible round. The round is ~a QUARTER of the static set; `Math.round(staticCount/4)`
 * collapsed to 0 for a 1-question set (so the gate challenge round never ran), and
 * rounded DOWN below a true quarter for sizes like 13/17/21 — `ceil` + this floor fix both. */
export const GATE_MIN_AI_QUESTIONS = 2;

/**
 * AI challenge-round size for the daily-required gate: about a QUARTER of the static
 * required set (`ceil(staticCount / 4)`), floored at {@link GATE_MIN_AI_QUESTIONS} so a
 * small set still runs a round. An empty set (0) gets no round.
 */
export function recommendedAiCountForStaticCount(staticCount: number): number {
  if (staticCount <= 0) {
    return 0;
  }
  return Math.max(GATE_MIN_AI_QUESTIONS, Math.ceil(staticCount / 4));
}

export type RequiredPracticeSet = {
  /** The selected static questions, deduped (no question ever repeats). */
  questions: PracticeQuestion[];
  /** SR-due topics actually served a question (advance these on a pass). */
  srTopicsServed: string[];
  /** Topics that received a guaranteed-coverage question (sub-60 and SR-due). */
  coverageTopics: string[];
  /** Suggested AI question count for the gate: ~ceil(staticCount / 4), floored so a small set still runs a round. */
  recommendedAiCount: number;
};

export type BuildRequiredPracticeOptions = {
  /** Today's date key (YYYY-MM-DD, from getTodayKey). */
  today: string;
  rng?: RandomNumberGenerator;
  weakTarget?: number;
  srTarget?: number;
  baselineTarget?: number;
};

export function buildRequiredPracticeSet(
  progress: LessonProgress,
  pool: readonly PracticeQuestion[],
  options: BuildRequiredPracticeOptions,
): RequiredPracticeSet {
  const {
    today,
    rng = Math.random,
    weakTarget = DEFAULT_WEAK_TARGET,
    srTarget = DEFAULT_SR_TARGET,
    baselineTarget = DEFAULT_BASELINE_TARGET,
  } = options;

  // Group pool questions by their owning lesson (the topic), preserving order.
  const questionsByTopic = new Map<string, PracticeQuestion[]>();
  for (const question of pool) {
    const topic = question.lessonId;
    if (!topic) {
      continue;
    }
    const list = questionsByTopic.get(topic);
    if (list) {
      list.push(question);
    } else {
      questionsByTopic.set(topic, [question]);
    }
  }
  const poolTopics = new Set(questionsByTopic.keys());

  /* RE-RANDOMIZE THE PER-TOPIC DRAW. Shuffle each topic's questions with the rng so the
   * SPECIFIC question pulled from a topic's pool varies per ATTEMPT (each attempt passes a
   * fresh rng), while the SELECTION CRITERIA below — which topics are chosen (sub-60 coverage,
   * SR-due coverage, the weak/SR quotas) and how many — stay identical, since reordering WITHIN
   * a topic changes neither its eligibility nor its draw count. Deterministic for a given seed
   * (topics shuffled in stable insertion order), so a set is reproducible from its seed; an
   * in-progress attempt is restored from its persisted snapshot (never rebuilt), keeping its
   * exact questions on resume. */
  for (const list of questionsByTopic.values()) {
    for (let index = list.length - 1; index > 0; index -= 1) {
      const swap = Math.min(index, Math.floor(rng() * (index + 1)));
      [list[index], list[swap]] = [list[swap], list[index]];
    }
  }

  const selectedIds = new Set<string>();
  const questions: PracticeQuestion[] = [];
  // Per-topic cursor so each takeUnused scan resumes where the last left off.
  const topicCursor = new Map<string, number>();

  /** Selects (and records) the next unused question for a topic, or undefined when exhausted. */
  function takeUnused(topic: string): PracticeQuestion | undefined {
    const list = questionsByTopic.get(topic);
    if (!list) {
      return undefined;
    }
    let cursor = topicCursor.get(topic) ?? 0;
    while (cursor < list.length) {
      const candidate = list[cursor];
      cursor += 1;
      if (!selectedIds.has(candidate.id)) {
        topicCursor.set(topic, cursor);
        selectedIds.add(candidate.id);
        questions.push(candidate);
        return candidate;
      }
    }
    topicCursor.set(topic, cursor);
    return undefined;
  }

  function topicHasUnused(topic: string): boolean {
    const list = questionsByTopic.get(topic);
    return list ? list.some((question) => !selectedIds.has(question.id)) : false;
  }

  // SR-due topics (most overdue first) and weak / sub-60 topics (weakest first),
  // each intersected with the actual pool.
  const srDueTopics = getSrDueTopics(progress, today).filter((topic) => poolTopics.has(topic));
  const sub60Topics = getTopicsBelowMastery(progress, SUB60_MASTERY_THRESHOLD).filter((topic) =>
    poolTopics.has(topic),
  );
  const weakTopics = getTopicsBelowMastery(progress, WEAK_MASTERY_THRESHOLD).filter((topic) =>
    poolTopics.has(topic),
  );

  let srCount = 0;
  let weakCount = 0;
  const srTopicsServed = new Set<string>();
  const coverageTopics = new Set<string>();

  // (1) Guaranteed coverage: one question for every sub-60 topic (ascending
  //     mastery), then one for every SR-due topic (most overdue first). These are
  //     disjoint draws (each consumes a distinct unused question), so a weak+SR
  //     topic contributes one to each quota when its pool allows.
  for (const topic of sub60Topics) {
    if (takeUnused(topic)) {
      weakCount += 1;
      coverageTopics.add(topic);
    }
  }
  for (const topic of srDueTopics) {
    if (takeUnused(topic)) {
      srCount += 1;
      srTopicsServed.add(topic);
      coverageTopics.add(topic);
    }
  }

  // (2) SR quota: round-robin the due topics until srCount reaches the target or
  //     the SR pool is exhausted. Target grows with the number of due topics so
  //     every due topic stays covered even past 10.
  const srQuotaTarget = Math.max(srTarget, srDueTopics.length);
  if (srDueTopics.length > 0) {
    let advanced = true;
    while (srCount < srQuotaTarget && advanced) {
      advanced = false;
      for (const topic of srDueTopics) {
        if (srCount >= srQuotaTarget) {
          break;
        }
        if (takeUnused(topic)) {
          srCount += 1;
          srTopicsServed.add(topic);
          advanced = true;
        }
      }
    }
  }

  // (3) Weak quota: weighted-sample weak topics by INVERSE mastery (lower mastery
  //     => higher weight) until weakCount reaches the target or the weak pool is
  //     exhausted. Target grows with the number of sub-60 topics.
  const weakQuotaTarget = Math.max(weakTarget, sub60Topics.length);
  const weakCandidates = weakTopics.filter((topic) => topicHasUnused(topic));
  while (weakCount < weakQuotaTarget && weakCandidates.length > 0) {
    const weights = weakCandidates.map((topic) => {
      const mastery = getTopicMastery(progress, topic) ?? 0;
      return Math.max(0.02, WEAK_MASTERY_THRESHOLD - mastery);
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    let threshold = rng() * totalWeight;
    let pickIndex = weakCandidates.length - 1;
    for (let index = 0; index < weakCandidates.length; index += 1) {
      threshold -= weights[index];
      if (threshold < 0) {
        pickIndex = index;
        break;
      }
    }

    const topic = weakCandidates[pickIndex];
    if (takeUnused(topic)) {
      weakCount += 1;
    }
    if (!topicHasUnused(topic)) {
      weakCandidates.splice(pickIndex, 1);
    }
  }

  // (4) Baseline general top-up so the daily-required gate is always passable with
  //     a mixed review, even when nothing is weak or due. Samples remaining pool
  //     questions (deterministically shuffled) until the baseline is met.
  if (questions.length < baselineTarget) {
    const remaining = pool.filter((question) => !selectedIds.has(question.id));
    for (let index = remaining.length - 1; index > 0; index -= 1) {
      const swap = Math.min(index, Math.floor(rng() * (index + 1)));
      [remaining[index], remaining[swap]] = [remaining[swap], remaining[index]];
    }
    for (const candidate of remaining) {
      if (questions.length >= baselineTarget) {
        break;
      }
      if (!selectedIds.has(candidate.id)) {
        selectedIds.add(candidate.id);
        questions.push(candidate);
      }
    }
  }

  const staticCount = questions.length;

  return {
    questions,
    srTopicsServed: [...srTopicsServed],
    coverageTopics: [...coverageTopics],
    recommendedAiCount: recommendedAiCountForStaticCount(staticCount),
  };
}
