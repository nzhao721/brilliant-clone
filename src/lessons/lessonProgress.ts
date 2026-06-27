import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lesson, LessonStatus } from '../data/lessons';
import { resolveQuestionLessonId } from '../data/questionBank';
import { db } from '../lib/firebase';
import { syncLeaderboardEntry } from '../leaderboard/leaderboardFirestore';
import {
  deleteUserLessonProgress,
  loadUserLessonProgress,
  saveUserLessonProgress,
} from './firestoreProgress';

export const lessonProgressStorageKey = 'brilliant-clone.completed-lessons';
export const lessonProgressDayOffsetStorageKey = 'brilliant-clone.test-day-offset';
export const questionCompletionXp = 20;
export const dailyStreakBonusXp = 25;
// Correct practice answers earn a flat 10 XP each (separate from lesson XP).
export const practiceQuestionXp = 10;

/* Coins are separate from XP: flat per correct answer + flat completion bonus
 * (streak is XP-only), tracked in progress.totalCoinsEarned. */
export const coinsPerCorrectAnswer = 5;
export const lessonCompletionCoinBonus = 15;
/* Cap on recentMistakes history; keeps the synced doc well under Firestore's 1 MiB. */
export const recentMistakesLimit = 25;

export type QuestionAttemptStats = {
  correct: number;
  incorrect: number;
};

// Per-topic correct/incorrect tally keyed by topicKey (see getTopicKey).
export type TopicStat = {
  correct: number;
  incorrect: number;
};

/* One recorded wrong answer. `at` is an ISO 8601 UTC timestamp (sorts chronologically). */
export type RecentMistake = {
  questionId: string;
  topicKey: string;
  prompt: string;
  chosenLabel: string;
  correctLabel: string;
  at: string;
};

/* What one answer submission records into history (lessons + practice).
 * `category` (practice only) helps build the topicKey. */
export type ResponseContext = {
  questionId: string;
  isCorrect: boolean;
  source: 'lesson' | 'practice';
  chapterId: string;
  category?: string;
  lessonId?: string;
  prompt: string;
  chosenChoiceId: string;
  chosenLabel: string;
  correctLabel: string;
};

export type LessonProgress = {
  awardedQuestionIds?: Record<string, string[]>;
  completedLessonIds: string[];
  dailyCompletionDates: string[];
  dailyStudyMinutes?: Record<string, number>;
  lessonCompletedAt?: Record<string, string>;
  lessonResumeStates?: Record<string, LessonResumeState>;
  lessonTimeSpentMs?: Record<string, number>;
  questionAttempts?: Record<string, QuestionAttemptStats>;
  /* Per-topic tallies keyed by topicKey; optional so legacy progress loads (→ {}). */
  topicStats?: Record<string, TopicStat>;
  /* Newest-first wrong-answer history (capped); optional so legacy progress loads (→ []). */
  recentMistakes?: RecentMistake[];
  totalXp: number;
  /* Lifetime coins earned: own total, not derived from XP; optional for legacy (→ 0). */
  totalCoinsEarned?: number;
};

export type SavedQuestionState = {
  selectedOptionId: string;
  answerResult: 'correct' | 'incorrect' | null;
  showHint: boolean;
};

export type LessonResumeState = {
  stepIndex: number;
  questionStates: Record<string, SavedQuestionState>;
  /* Concept steps gated behind an interactive visual, keyed by step id (only
   * `true` stored). Omitted when empty to preserve the serialized shape. */
  interactionStates?: Record<string, boolean>;
};

export type LessonCompletionAward = {
  alreadyCompleted: boolean;
  questionsAnswered: number;
  lessonXp: number;
  dailyBonusXp: number;
  totalXpGained: number;
  /* Lesson-completion coins: per-question coins + flat bonus (no streak; differs
   * from totalXpGained). */
  coinsGained: number;
};

export type SequencedLesson = Lesson & {
  sequenceNumber: number;
  status: LessonStatus;
  lockedReason?: string;
};

const emptyProgress: LessonProgress = {
  awardedQuestionIds: {},
  completedLessonIds: [],
  dailyCompletionDates: [],
  dailyStudyMinutes: {},
  lessonCompletedAt: {},
  lessonResumeStates: {},
  lessonTimeSpentMs: {},
  questionAttempts: {},
  topicStats: {},
  recentMistakes: [],
  totalXp: 0,
  totalCoinsEarned: 0,
};

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function normalizeLessonResumeState(value: unknown): LessonResumeState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const resumeState = value as Partial<LessonResumeState>;
  const stepIndex =
    typeof resumeState.stepIndex === 'number' && Number.isFinite(resumeState.stepIndex)
      ? Math.max(0, Math.floor(resumeState.stepIndex))
      : 0;
  const questionStates: Record<string, SavedQuestionState> = {};

  if (resumeState.questionStates && typeof resumeState.questionStates === 'object') {
    for (const [stepId, stepState] of Object.entries(resumeState.questionStates)) {
      if (!stepState || typeof stepState !== 'object') {
        continue;
      }

      const questionState = stepState as Partial<SavedQuestionState>;
      const answerResult =
        questionState.answerResult === 'correct' || questionState.answerResult === 'incorrect'
          ? questionState.answerResult
          : null;

      questionStates[stepId] = {
        selectedOptionId:
          typeof questionState.selectedOptionId === 'string' ? questionState.selectedOptionId : '',
        answerResult,
        showHint: Boolean(questionState.showHint),
      };
    }
  }

  const interactionStates: Record<string, boolean> = {};

  if (resumeState.interactionStates && typeof resumeState.interactionStates === 'object') {
    for (const [stepId, isComplete] of Object.entries(resumeState.interactionStates)) {
      if (isComplete === true) {
        interactionStates[stepId] = true;
      }
    }
  }

  const normalized: LessonResumeState = {
    questionStates,
    stepIndex,
  };

  /* Attach interactionStates only when non-empty so serialized output is unchanged. */
  if (Object.keys(interactionStates).length > 0) {
    normalized.interactionStates = interactionStates;
  }

  return normalized;
}

function normalizeLessonResumeStates(value: unknown) {
  const lessonResumeStates: Record<string, LessonResumeState> = {};

  if (!value || typeof value !== 'object') {
    return lessonResumeStates;
  }

  for (const [lessonId, resumeState] of Object.entries(value)) {
    const normalizedResumeState = normalizeLessonResumeState(resumeState);

    if (normalizedResumeState) {
      lessonResumeStates[lessonId] = normalizedResumeState;
    }
  }

  return lessonResumeStates;
}

function normalizeAwardedQuestionIds(value: unknown) {
  const awardedQuestionIds: Record<string, string[]> = {};

  if (!value || typeof value !== 'object') {
    return awardedQuestionIds;
  }

  for (const [lessonId, questionIds] of Object.entries(value)) {
    if (Array.isArray(questionIds)) {
      awardedQuestionIds[lessonId] = uniqueValues(
        questionIds.filter((questionId) => typeof questionId === 'string'),
      );
    }
  }

  return awardedQuestionIds;
}

function normalizeDailyStudyMinutes(value: unknown) {
  const dailyStudyMinutes: Record<string, number> = {};

  if (!value || typeof value !== 'object') {
    return dailyStudyMinutes;
  }

  for (const [dateKey, minutes] of Object.entries(value)) {
    if (typeof minutes === 'number' && Number.isFinite(minutes)) {
      dailyStudyMinutes[dateKey] = Math.max(0, Math.floor(minutes));
    }
  }

  return dailyStudyMinutes;
}

function normalizeCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeQuestionAttempts(value: unknown) {
  const questionAttempts: Record<string, QuestionAttemptStats> = {};

  if (!value || typeof value !== 'object') {
    return questionAttempts;
  }

  for (const [questionId, stats] of Object.entries(value)) {
    if (typeof questionId !== 'string' || !stats || typeof stats !== 'object') {
      continue;
    }

    const candidate = stats as Partial<QuestionAttemptStats>;
    const correct = normalizeCount(candidate.correct);
    const incorrect = normalizeCount(candidate.incorrect);

    // Drop entries with no recorded attempts.
    if (correct === 0 && incorrect === 0) {
      continue;
    }

    questionAttempts[questionId] = { correct, incorrect };
  }

  return questionAttempts;
}

/* Like normalizeQuestionAttempts: floors/clamps counters, drops empty entries. */
function normalizeTopicStats(value: unknown) {
  const topicStats: Record<string, TopicStat> = {};

  if (!value || typeof value !== 'object') {
    return topicStats;
  }

  for (const [topicKey, stats] of Object.entries(value)) {
    if (typeof topicKey !== 'string' || !topicKey || !stats || typeof stats !== 'object') {
      continue;
    }

    const candidate = stats as Partial<TopicStat>;
    const correct = normalizeCount(candidate.correct);
    const incorrect = normalizeCount(candidate.incorrect);

    // Drop empty entries so the map only tracks topics with real responses.
    if (correct === 0 && incorrect === 0) {
      continue;
    }

    topicStats[topicKey] = { correct, incorrect };
  }

  return topicStats;
}

/* Normalizes recentMistakes: keeps well-formed entries (identity + ISO `at`
 * required), preserves order, caps at recentMistakesLimit. */
function normalizeRecentMistakes(value: unknown) {
  const recentMistakes: RecentMistake[] = [];

  if (!Array.isArray(value)) {
    return recentMistakes;
  }

  for (const entry of value) {
    if (recentMistakes.length >= recentMistakesLimit) {
      break;
    }

    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const candidate = entry as Partial<RecentMistake>;

    /* Identity (questionId, topicKey) + sortable `at` are required for merge/dedupe. */
    if (
      typeof candidate.questionId !== 'string' ||
      !candidate.questionId ||
      typeof candidate.topicKey !== 'string' ||
      !candidate.topicKey ||
      typeof candidate.at !== 'string' ||
      !candidate.at
    ) {
      continue;
    }

    recentMistakes.push({
      questionId: candidate.questionId,
      topicKey: candidate.topicKey,
      prompt: typeof candidate.prompt === 'string' ? candidate.prompt : '',
      chosenLabel: typeof candidate.chosenLabel === 'string' ? candidate.chosenLabel : '',
      correctLabel: typeof candidate.correctLabel === 'string' ? candidate.correctLabel : '',
      at: candidate.at,
    });
  }

  return recentMistakes;
}

function normalizeLessonCompletedAt(value: unknown) {
  const lessonCompletedAt: Record<string, string> = {};

  if (!value || typeof value !== 'object') {
    return lessonCompletedAt;
  }

  for (const [lessonId, isoTimestamp] of Object.entries(value)) {
    if (typeof lessonId === 'string' && typeof isoTimestamp === 'string' && isoTimestamp) {
      lessonCompletedAt[lessonId] = isoTimestamp;
    }
  }

  return lessonCompletedAt;
}

function normalizeLessonTimeSpentMs(value: unknown) {
  const lessonTimeSpentMs: Record<string, number> = {};

  if (!value || typeof value !== 'object') {
    return lessonTimeSpentMs;
  }

  for (const [lessonId, milliseconds] of Object.entries(value)) {
    if (typeof lessonId !== 'string') {
      continue;
    }

    if (typeof milliseconds === 'number' && Number.isFinite(milliseconds) && milliseconds > 0) {
      lessonTimeSpentMs[lessonId] = Math.floor(milliseconds);
    }
  }

  return lessonTimeSpentMs;
}

function readTestDayOffset() {
  if (typeof window === 'undefined') {
    return 0;
  }

  const storedValue = window.localStorage.getItem(lessonProgressDayOffsetStorageKey);
  const parsedValue = storedValue ? Number.parseInt(storedValue, 10) : 0;
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function writeTestDayOffset(dayOffset: number) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(lessonProgressDayOffsetStorageKey, String(dayOffset));
}

function clearTestDayOffset() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(lessonProgressDayOffsetStorageKey);
}

export function getTodayKey(dayOffset = readTestDayOffset()) {
  const today = new Date();
  today.setDate(today.getDate() + dayOffset);
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeProgress(progress: Partial<LessonProgress>): LessonProgress {
  return {
    awardedQuestionIds: normalizeAwardedQuestionIds(progress.awardedQuestionIds),
    completedLessonIds: uniqueValues(progress.completedLessonIds ?? []),
    dailyCompletionDates: uniqueValues(progress.dailyCompletionDates ?? []),
    dailyStudyMinutes: normalizeDailyStudyMinutes(progress.dailyStudyMinutes),
    lessonCompletedAt: normalizeLessonCompletedAt(progress.lessonCompletedAt),
    lessonResumeStates: normalizeLessonResumeStates(progress.lessonResumeStates),
    lessonTimeSpentMs: normalizeLessonTimeSpentMs(progress.lessonTimeSpentMs),
    questionAttempts: normalizeQuestionAttempts(progress.questionAttempts),
    topicStats: normalizeTopicStats(progress.topicStats),
    recentMistakes: normalizeRecentMistakes(progress.recentMistakes),
    totalXp: typeof progress.totalXp === 'number' ? progress.totalXp : 0,
    totalCoinsEarned:
      typeof progress.totalCoinsEarned === 'number' && Number.isFinite(progress.totalCoinsEarned)
        ? Math.max(0, Math.floor(progress.totalCoinsEarned))
        : 0,
  };
}

function readLessonProgress() {
  if (typeof window === 'undefined') {
    return emptyProgress;
  }

  const storedValue = window.localStorage.getItem(lessonProgressStorageKey);

  if (!storedValue) {
    return emptyProgress;
  }

  try {
    const parsedValue = JSON.parse(storedValue);
    if (Array.isArray(parsedValue)) {
      const completedLessonIds = parsedValue.filter((value) => typeof value === 'string');
      return normalizeProgress({
        completedLessonIds,
        totalXp: 0,
      });
    }

    if (parsedValue && typeof parsedValue === 'object') {
      return normalizeProgress(parsedValue);
    }

    return emptyProgress;
  } catch {
    return emptyProgress;
  }
}

function writeLessonProgress(progress: LessonProgress) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(lessonProgressStorageKey, JSON.stringify(progress));
}

function clearLessonProgress() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(lessonProgressStorageKey);
}

function hasMeaningfulProgress(progress: LessonProgress) {
  return (
    progress.completedLessonIds.length > 0 ||
    progress.dailyCompletionDates.length > 0 ||
    Object.keys(progress.dailyStudyMinutes ?? {}).length > 0 ||
    Object.keys(progress.awardedQuestionIds ?? {}).length > 0 ||
    Object.keys(progress.lessonResumeStates ?? {}).length > 0 ||
    Object.keys(progress.questionAttempts ?? {}).length > 0 ||
    Object.keys(progress.lessonCompletedAt ?? {}).length > 0 ||
    Object.keys(progress.lessonTimeSpentMs ?? {}).length > 0 ||
    Object.keys(progress.topicStats ?? {}).length > 0 ||
    (progress.recentMistakes?.length ?? 0) > 0 ||
    progress.totalXp > 0
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

export function areLessonProgressEqual(leftProgress: LessonProgress, rightProgress: LessonProgress) {
  return stableStringify(normalizeProgress(leftProgress)) === stableStringify(normalizeProgress(rightProgress));
}

export function shouldSaveMergedProgress(
  remoteProgress: LessonProgress | null,
  localProgress: LessonProgress,
  mergedProgress: LessonProgress,
) {
  if (!hasMeaningfulProgress(localProgress) && !hasMeaningfulProgress(mergedProgress)) {
    return false;
  }

  return !remoteProgress || !areLessonProgressEqual(remoteProgress, mergedProgress);
}

/**
 * Unions two recentMistakes lists, deduped by (questionId + at) so re-syncs never
 * duplicate, sorted newest-first (descending ISO `at`), capped at recentMistakesLimit.
 */
function mergeRecentMistakes(
  remoteMistakes: RecentMistake[],
  localMistakes: RecentMistake[],
): RecentMistake[] {
  const byKey = new Map<string, RecentMistake>();

  for (const mistake of [...remoteMistakes, ...localMistakes]) {
    // NUL separator can't appear in question ids or ISO timestamps.
    const dedupeKey = `${mistake.questionId}\u0000${mistake.at}`;

    if (!byKey.has(dedupeKey)) {
      byKey.set(dedupeKey, mistake);
    }
  }

  return Array.from(byKey.values())
    .sort((left, right) => {
      if (left.at === right.at) {
        return 0;
      }

      return left.at < right.at ? 1 : -1;
    })
    .slice(0, recentMistakesLimit);
}

export function mergeLessonProgress(remoteProgress: LessonProgress, localProgress: LessonProgress) {
  const normalizedRemoteProgress = normalizeProgress(remoteProgress);
  const normalizedLocalProgress = normalizeProgress(localProgress);
  const awardedQuestionIds = { ...normalizedRemoteProgress.awardedQuestionIds };

  for (const [lessonId, questionIds] of Object.entries(
    normalizedLocalProgress.awardedQuestionIds ?? {},
  )) {
    awardedQuestionIds[lessonId] = uniqueValues([
      ...(awardedQuestionIds[lessonId] ?? []),
      ...questionIds,
    ]);
  }

  const completedLessonIds = uniqueValues([
    ...normalizedRemoteProgress.completedLessonIds,
    ...normalizedLocalProgress.completedLessonIds,
  ]);
  const lessonResumeStates = {
    ...normalizedRemoteProgress.lessonResumeStates,
    ...normalizedLocalProgress.lessonResumeStates,
  };
  const dailyStudyMinutes = { ...normalizedRemoteProgress.dailyStudyMinutes };

  for (const [dateKey, minutes] of Object.entries(normalizedLocalProgress.dailyStudyMinutes ?? {})) {
    dailyStudyMinutes[dateKey] = Math.max(dailyStudyMinutes[dateKey] ?? 0, minutes);
  }

  /* Per-question attempts: max-merge each counter so re-syncs never double-count. */
  const questionAttempts = { ...normalizedRemoteProgress.questionAttempts };

  for (const [questionId, stats] of Object.entries(normalizedLocalProgress.questionAttempts ?? {})) {
    const existing = questionAttempts[questionId];
    questionAttempts[questionId] = existing
      ? {
          correct: Math.max(existing.correct, stats.correct),
          incorrect: Math.max(existing.incorrect, stats.incorrect),
        }
      : stats;
  }

  /* Per-topic tallies: max-merge each counter so a re-sync never double-counts. */
  const topicStats = { ...normalizedRemoteProgress.topicStats };

  for (const [topicKey, stats] of Object.entries(normalizedLocalProgress.topicStats ?? {})) {
    const existing = topicStats[topicKey];
    topicStats[topicKey] = existing
      ? {
          correct: Math.max(existing.correct, stats.correct),
          incorrect: Math.max(existing.incorrect, stats.incorrect),
        }
      : stats;
  }

  // Recent mistakes: union both lists by recency, deduped and capped (see helper).
  const recentMistakes = mergeRecentMistakes(
    normalizedRemoteProgress.recentMistakes ?? [],
    normalizedLocalProgress.recentMistakes ?? [],
  );

  // Per-lesson time: max-merge for the same no-double-count reason.
  const lessonTimeSpentMs = { ...normalizedRemoteProgress.lessonTimeSpentMs };

  for (const [lessonId, milliseconds] of Object.entries(
    normalizedLocalProgress.lessonTimeSpentMs ?? {},
  )) {
    lessonTimeSpentMs[lessonId] = Math.max(lessonTimeSpentMs[lessonId] ?? 0, milliseconds);
  }

  /* First-completion timestamps: keep the earliest across remote/local (lexical
   * min of ISO strings). */
  const lessonCompletedAt = { ...normalizedRemoteProgress.lessonCompletedAt };

  for (const [lessonId, isoTimestamp] of Object.entries(
    normalizedLocalProgress.lessonCompletedAt ?? {},
  )) {
    const existing = lessonCompletedAt[lessonId];
    lessonCompletedAt[lessonId] = existing && existing < isoTimestamp ? existing : isoTimestamp;
  }

  for (const completedLessonId of completedLessonIds) {
    delete lessonResumeStates[completedLessonId];
  }

  return normalizeProgress({
    awardedQuestionIds,
    completedLessonIds,
    dailyCompletionDates: uniqueValues([
      ...normalizedRemoteProgress.dailyCompletionDates,
      ...normalizedLocalProgress.dailyCompletionDates,
    ]),
    dailyStudyMinutes,
    lessonCompletedAt,
    lessonResumeStates,
    lessonTimeSpentMs,
    questionAttempts,
    topicStats,
    recentMistakes,
    totalXp: Math.max(normalizedRemoteProgress.totalXp, normalizedLocalProgress.totalXp),
    /* Lifetime coins only grow: keep the larger so a re-sync never loses coins. */
    totalCoinsEarned: Math.max(
      normalizedRemoteProgress.totalCoinsEarned ?? 0,
      normalizedLocalProgress.totalCoinsEarned ?? 0,
    ),
  });
}

export function getSequencedLessons(lessons: Lesson[], completedLessonIds: string[]) {
  const completedLessonSet = new Set(completedLessonIds);

  return lessons.map<SequencedLesson>((lesson, index) => {
    const previousLessonsComplete = lessons
      .slice(0, index)
      .every((previousLesson) => completedLessonSet.has(previousLesson.id));
    const isComplete = previousLessonsComplete && completedLessonSet.has(lesson.id);
    const previousIsComplete = previousLessonsComplete;
    const hasInteractiveContent = lesson.steps.length > 0;

    if (isComplete) {
      return {
        ...lesson,
        sequenceNumber: index + 1,
        status: 'complete',
      };
    }

    if (previousIsComplete && hasInteractiveContent) {
      return {
        ...lesson,
        sequenceNumber: index + 1,
        status: 'available',
      };
    }

    return {
      ...lesson,
      lockedReason: hasInteractiveContent
        ? `Complete Lesson ${index} first.`
        : 'Coming soon.',
      sequenceNumber: index + 1,
      status: 'locked',
    };
  });
}

export function getSequencedLessonById(
  lessons: Lesson[],
  completedLessonIds: string[],
  lessonId: string | undefined,
) {
  return getSequencedLessons(lessons, completedLessonIds).find((lesson) => lesson.id === lessonId);
}

/*
 * Chapter-aware progress summaries. Unlocking stays globally linear (see
 * getSequencedLessons); these only measure progress within one chapter. Take the
 * chapter's lessons as an arg to avoid importing the content layer.
 */

export type ChapterLessonProgress = {
  /** Number of lessons authored in the chapter (0 while content is landing). */
  totalLessons: number;
  /** How many of those lessons the learner has completed. */
  completedLessons: number;
  /** completedLessons / totalLessons as a 0–100 integer (0 when no lessons). */
  percentComplete: number;
  /** True only when the chapter has lessons AND all of them are complete. */
  isComplete: boolean;
  /** True once at least one lesson in the chapter is complete. */
  isStarted: boolean;
  /** Whether the chapter has any lessons yet. */
  hasLessons: boolean;
};

/** Summarizes a learner's completion within one chapter's lessons. */
export function getChapterLessonProgress(
  chapterLessons: Lesson[],
  completedLessonIds: string[],
): ChapterLessonProgress {
  const completedLessonSet = new Set(completedLessonIds);
  const totalLessons = chapterLessons.length;
  const completedLessons = chapterLessons.filter((lesson) =>
    completedLessonSet.has(lesson.id),
  ).length;
  const hasLessons = totalLessons > 0;

  return {
    totalLessons,
    completedLessons,
    percentComplete: hasLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
    isComplete: hasLessons && completedLessons === totalLessons,
    isStarted: completedLessons > 0,
    hasLessons,
  };
}

/**
 * A chapter's practice unlocks once the learner completes at least one lesson in
 * it; a chapter with no lessons stays locked.
 */
export function isChapterPracticeAvailable(
  chapterLessons: Lesson[],
  completedLessonIds: string[],
): boolean {
  const completedLessonSet = new Set(completedLessonIds);
  return chapterLessons.some((lesson) => completedLessonSet.has(lesson.id));
}

export function getLessonQuestionIds(lesson: Lesson) {
  return lesson.steps
    .filter((step) => step.type === 'multiple-choice')
    .map((step) => step.id);
}

export function getCompletedLessonStepCount(lesson: Lesson, resumeState: LessonResumeState | undefined) {
  if (!resumeState) {
    return 0;
  }

  return lesson.steps.filter((step, index) => {
    if (step.type === 'concept') {
      return index < resumeState.stepIndex;
    }

    return resumeState.questionStates[step.id]?.answerResult === 'correct';
  }).length;
}

export function getPartialLessonProgressPercent(lesson: Lesson, resumeState: LessonResumeState | undefined) {
  if (lesson.steps.length === 0) {
    return 0;
  }

  return Math.round((getCompletedLessonStepCount(lesson, resumeState) / lesson.steps.length) * 100);
}

export function awardQuestionInProgress(
  progress: LessonProgress,
  lessonId: string,
  questionId: string,
) {
  const nextProgress = normalizeProgress(progress);
  const awardedLessonQuestionIds = nextProgress.awardedQuestionIds?.[lessonId] ?? [];

  if (awardedLessonQuestionIds.includes(questionId)) {
    return {
      alreadyAwarded: true,
      progress: nextProgress,
      xpGained: 0,
      coinsGained: 0,
    };
  }

  const awardedQuestionIds = {
    ...nextProgress.awardedQuestionIds,
    [lessonId]: [...awardedLessonQuestionIds, questionId],
  };
  // Every correct answer earns a flat coin amount, regardless of question type.
  const coinsGained = coinsPerCorrectAnswer;

  return {
    alreadyAwarded: false,
    progress: {
      ...nextProgress,
      awardedQuestionIds,
      totalXp: nextProgress.totalXp + questionCompletionXp,
      totalCoinsEarned: (nextProgress.totalCoinsEarned ?? 0) + coinsGained,
    },
    xpGained: questionCompletionXp,
    coinsGained,
  };
}

export function completeLessonInProgress(
  progress: LessonProgress,
  lessonId: string,
  questionIds: string[],
  completionDate = getTodayKey(),
  completedAtIso = new Date().toISOString(),
) {
  const questionsAnswered = questionIds.length;
  if (progress.completedLessonIds.includes(lessonId)) {
    const nextProgress = normalizeProgress(progress);
    delete nextProgress.lessonResumeStates?.[lessonId];

    return {
      award: {
        alreadyCompleted: true,
        coinsGained: 0,
        dailyBonusXp: 0,
        lessonXp: 0,
        questionsAnswered,
        totalXpGained: 0,
      },
      progress: nextProgress,
    };
  }

  const progressWithQuestionXp = questionIds.reduce(
    (currentProgress, questionId) =>
      awardQuestionInProgress(currentProgress, lessonId, questionId).progress,
    progress,
  );
  const isFirstCompletionToday = !progress.dailyCompletionDates.includes(completionDate);
  const lessonXp = questionIds.length * questionCompletionXp;
  // Record the first-completion timestamp once; never overwrite an existing one.
  const lessonCompletedAt = { ...(progressWithQuestionXp.lessonCompletedAt ?? {}) };
  if (!lessonCompletedAt[lessonId]) {
    lessonCompletedAt[lessonId] = completedAtIso;
  }
  const nextProgress = normalizeProgress({
    ...progressWithQuestionXp,
    completedLessonIds: [...progressWithQuestionXp.completedLessonIds, lessonId],
    dailyCompletionDates: [...progressWithQuestionXp.dailyCompletionDates, completionDate],
    lessonCompletedAt,
  });
  delete nextProgress.lessonResumeStates?.[lessonId];
  const dailyBonusXp = isFirstCompletionToday
    ? getCurrentStreakDays(nextProgress.dailyCompletionDates, completionDate) * dailyStreakBonusXp
    : 0;
  const totalXpGained = lessonXp + dailyBonusXp;
  /* Flat per-answer coins + flat completion bonus (streak grants XP only). */
  const lessonAnswerCoins = questionIds.length * coinsPerCorrectAnswer;
  const coinsGained = lessonAnswerCoins + lessonCompletionCoinBonus;
  const progressWithXp = {
    ...nextProgress,
    totalXp: nextProgress.totalXp + dailyBonusXp,
    /* Per-question coins were already added by the reduce above; add only the
     * one-time completion bonus so coins never double-count. */
    totalCoinsEarned: (nextProgress.totalCoinsEarned ?? 0) + lessonCompletionCoinBonus,
  };

  return {
    award: {
      alreadyCompleted: false,
      coinsGained,
      dailyBonusXp,
      lessonXp,
      questionsAnswered,
      totalXpGained,
    },
    progress: progressWithXp,
  };
}

export type PracticeAnswerAward = {
  correct: boolean;
  questionXp: number;
  dailyBonusXp: number;
  totalXpGained: number;
  /* Coins this answer: coinsPerCorrectAnswer if correct, else 0 (no streak; differs
   * from totalXpGained). */
  coinsGained: number;
};

/** Options for {@link awardPracticeQuestionInProgress}. */
export type AwardPracticeQuestionOptions = {
  /**
   * Whether a correct answer earns coins (default `true`). `false` awards XP and
   * keeps the streak but no coins — used by Slipstream (coins come from the track).
   */
  awardCoins?: boolean;
};

/**
 * Awards XP for one practice answer and keeps the daily streak alive (a correct
 * answer earns `practiceQuestionXp`). The day's first practice/lesson activity
 * grants the streak bonus, shared with lessons via `dailyCompletionDates` (once
 * per day). A correct answer also earns coins unless `options.awardCoins = false`
 * (XP-only, used by the race reward).
 */
export function awardPracticeQuestionInProgress(
  progress: LessonProgress,
  isCorrect: boolean,
  activityDate = getTodayKey(),
  options: AwardPracticeQuestionOptions = {},
): { award: PracticeAnswerAward; progress: LessonProgress } {
  const { awardCoins = true } = options;
  const baseProgress = normalizeProgress(progress);
  const questionXp = isCorrect ? practiceQuestionXp : 0;
  /* Coins only from a correct answer when awardCoins is set; never from the streak. */
  const coinsGained = isCorrect && awardCoins ? coinsPerCorrectAnswer : 0;
  const isFirstActivityToday = !baseProgress.dailyCompletionDates.includes(activityDate);
  const dailyCompletionDates = isFirstActivityToday
    ? [...baseProgress.dailyCompletionDates, activityDate]
    : baseProgress.dailyCompletionDates;
  const dailyBonusXp = isFirstActivityToday
    ? getCurrentStreakDays(dailyCompletionDates, activityDate) * dailyStreakBonusXp
    : 0;
  const totalXpGained = questionXp + dailyBonusXp;

  return {
    award: {
      correct: isCorrect,
      questionXp,
      dailyBonusXp,
      totalXpGained,
      coinsGained,
    },
    progress: normalizeProgress({
      ...baseProgress,
      dailyCompletionDates,
      totalXp: baseProgress.totalXp + totalXpGained,
      totalCoinsEarned: (baseProgress.totalCoinsEarned ?? 0) + coinsGained,
    }),
  };
}

/* Challenge-round answers reward DOUBLE a normal practice answer. */
export const challengeRewardMultiplier = 2;

export type ChallengeAnswerAward = {
  correct: boolean;
  xpGained: number;
  coinsGained: number;
};

/**
 * Awards DOUBLE XP + coins for a correct CHALLENGE-round answer (nothing for a
 * wrong one). Unlike {@link awardPracticeQuestionInProgress} it does NOT touch the
 * streak and records no history (AI questions have no stable topic); it only grows
 * lifetime totalXp/totalCoinsEarned.
 */
export function awardChallengeQuestionInProgress(
  progress: LessonProgress,
  isCorrect: boolean,
): { award: ChallengeAnswerAward; progress: LessonProgress } {
  const baseProgress = normalizeProgress(progress);
  const xpGained = isCorrect ? practiceQuestionXp * challengeRewardMultiplier : 0;
  const coinsGained = isCorrect ? coinsPerCorrectAnswer * challengeRewardMultiplier : 0;

  return {
    award: { correct: isCorrect, xpGained, coinsGained },
    progress: normalizeProgress({
      ...baseProgress,
      totalXp: baseProgress.totalXp + xpGained,
      totalCoinsEarned: (baseProgress.totalCoinsEarned ?? 0) + coinsGained,
    }),
  };
}

export function getCurrentStreakDays(dailyCompletionDates: string[], todayKey = getTodayKey()) {
  const completionDateSet = new Set(dailyCompletionDates);
  const cursor = new Date(`${todayKey}T00:00:00`);

  if (!completionDateSet.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streakDays = 0;

  while (completionDateSet.has(cursor.toISOString().slice(0, 10))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streakDays;
}

export function getStudyMinutesFromMilliseconds(millisecondsSpent: number) {
  if (!Number.isFinite(millisecondsSpent) || millisecondsSpent <= 0) {
    return 0;
  }

  return Math.max(1, Math.round(millisecondsSpent / 60000));
}

export function addDailyStudyMinutesInProgress(
  progress: LessonProgress,
  dateKey: string,
  millisecondsSpent: number,
) {
  const minutesSpent = getStudyMinutesFromMilliseconds(millisecondsSpent);

  return normalizeProgress({
    ...progress,
    dailyStudyMinutes: {
      ...progress.dailyStudyMinutes,
      [dateKey]: (progress.dailyStudyMinutes?.[dateKey] ?? 0) + minutesSpent,
    },
  });
}

/**
 * Records one answer submission, bumping `correct` or `incorrect` by one. Call on
 * every real submit (not resume/re-render) so accuracy reflects real attempts.
 */
export function recordQuestionAttemptInProgress(
  progress: LessonProgress,
  questionId: string,
  isCorrect: boolean,
) {
  const nextProgress = normalizeProgress(progress);
  const existing = nextProgress.questionAttempts?.[questionId] ?? { correct: 0, incorrect: 0 };
  const updated = isCorrect
    ? { correct: existing.correct + 1, incorrect: existing.incorrect }
    : { correct: existing.correct, incorrect: existing.incorrect + 1 };

  return normalizeProgress({
    ...nextProgress,
    questionAttempts: {
      ...nextProgress.questionAttempts,
      [questionId]: updated,
    },
  });
}

/**
 * Grouping key for topicStats / recentMistakes at PER-LESSON granularity, so a
 * lesson's questions and its practice questions share ONE topic:
 *  • Lesson answers key by `lessonId`.
 *  • Practice answers resolve their owning lesson via resolveQuestionLessonId.
 *  • Fallbacks: `${chapterId}/${category}`, then `${chapterId}`.
 * Legacy keys aren't migrated — it self-heals as new answers accrue.
 */
export function getTopicKey(context: ResponseContext): string {
  if (context.lessonId) {
    return context.lessonId;
  }

  if (context.category) {
    return (
      resolveQuestionLessonId(context.chapterId, context.category) ??
      `${context.chapterId}/${context.category}`
    );
  }

  return context.chapterId;
}

/**
 * Records ONE answer submission into response history — the single, pure entry
 * point for lessons and practice. Updates `questionAttempts` (via
 * recordQuestionAttemptInProgress) and `topicStats`, and for wrong answers only
 * prepends a capped, newest-first `recentMistakes` entry.
 */
export function recordResponseInProgress(
  progress: LessonProgress,
  context: ResponseContext,
  at = new Date().toISOString(),
): LessonProgress {
  // Reuse the aggregate attempt recorder so accuracy analytics stay unchanged.
  const withAttempt = recordQuestionAttemptInProgress(
    progress,
    context.questionId,
    context.isCorrect,
  );

  const topicKey = getTopicKey(context);
  const existingTopicStat = withAttempt.topicStats?.[topicKey] ?? { correct: 0, incorrect: 0 };
  const updatedTopicStat = context.isCorrect
    ? { correct: existingTopicStat.correct + 1, incorrect: existingTopicStat.incorrect }
    : { correct: existingTopicStat.correct, incorrect: existingTopicStat.incorrect + 1 };

  /* Only wrong answers add to history; prepend newest-first and cap. */
  const recentMistakes = context.isCorrect
    ? withAttempt.recentMistakes ?? []
    : [
        {
          questionId: context.questionId,
          topicKey,
          prompt: context.prompt,
          chosenLabel: context.chosenLabel,
          correctLabel: context.correctLabel,
          at,
        },
        ...(withAttempt.recentMistakes ?? []),
      ].slice(0, recentMistakesLimit);

  return normalizeProgress({
    ...withAttempt,
    topicStats: {
      ...withAttempt.topicStats,
      [topicKey]: updatedTopicStat,
    },
    recentMistakes,
  });
}

/** Accumulates raw milliseconds of study time against a single lesson. */
export function recordLessonTimeInProgress(
  progress: LessonProgress,
  lessonId: string,
  millisecondsSpent: number,
) {
  const nextProgress = normalizeProgress(progress);

  if (!Number.isFinite(millisecondsSpent) || millisecondsSpent <= 0) {
    return nextProgress;
  }

  return normalizeProgress({
    ...nextProgress,
    lessonTimeSpentMs: {
      ...nextProgress.lessonTimeSpentMs,
      [lessonId]: (nextProgress.lessonTimeSpentMs?.[lessonId] ?? 0) + Math.floor(millisecondsSpent),
    },
  });
}

/** Records study time once into both the daily-minutes and per-lesson totals. */
export function addStudyTimeInProgress(
  progress: LessonProgress,
  dateKey: string,
  lessonId: string,
  millisecondsSpent: number,
) {
  const withDailyMinutes = addDailyStudyMinutesInProgress(progress, dateKey, millisecondsSpent);
  return recordLessonTimeInProgress(withDailyMinutes, lessonId, millisecondsSpent);
}

/** Converts a `YYYY-MM-DD` key to a UTC day index (DST-safe, exact day diffs). */
function dateKeyToDayNumber(dateKey: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof dateKey === 'string' ? dateKey : '');
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);

  return Number.isNaN(utc) ? null : Math.floor(utc / 86_400_000);
}

/** Longest run of consecutive calendar days present in the completion dates. */
export function getLongestStreakDays(dailyCompletionDates: string[]) {
  const dayNumbers = Array.from(
    new Set(
      (Array.isArray(dailyCompletionDates) ? dailyCompletionDates : [])
        .map((dateKey) => dateKeyToDayNumber(dateKey))
        .filter((dayNumber): dayNumber is number => dayNumber !== null),
    ),
  ).sort((left, right) => left - right);

  if (dayNumbers.length === 0) {
    return 0;
  }

  let longestStreak = 1;
  let currentStreak = 1;

  for (let index = 1; index < dayNumbers.length; index += 1) {
    currentStreak = dayNumbers[index] === dayNumbers[index - 1] + 1 ? currentStreak + 1 : 1;
    longestStreak = Math.max(longestStreak, currentStreak);
  }

  return longestStreak;
}

/** Total all-time study minutes summed across every recorded day. */
export function getTotalStudyMinutes(progress: LessonProgress) {
  return Object.values(progress.dailyStudyMinutes ?? {}).reduce(
    (total, minutes) => total + (Number.isFinite(minutes) ? Math.max(0, minutes) : 0),
    0,
  );
}

/** Days the learner did anything: studied minutes OR completed a lesson. */
function getActiveDayKeys(progress: LessonProgress) {
  const activeDays = new Set<string>();

  for (const [dateKey, minutes] of Object.entries(progress.dailyStudyMinutes ?? {})) {
    if (typeof dateKey === 'string' && dateKey && minutes > 0) {
      activeDays.add(dateKey);
    }
  }

  for (const dateKey of progress.dailyCompletionDates ?? []) {
    if (typeof dateKey === 'string' && dateKey) {
      activeDays.add(dateKey);
    }
  }

  return activeDays;
}

export function getDaysActiveCount(progress: LessonProgress) {
  return getActiveDayKeys(progress).size;
}

/** Active days within the rolling 7-day window ending at (and including) today. */
export function getDaysActiveThisWeek(progress: LessonProgress, todayKey = getTodayKey()) {
  const todayNumber = dateKeyToDayNumber(todayKey);

  if (todayNumber === null) {
    return 0;
  }

  let activeThisWeek = 0;

  for (const dateKey of getActiveDayKeys(progress)) {
    const dayNumber = dateKeyToDayNumber(dateKey);

    if (dayNumber === null) {
      continue;
    }

    const daysAgo = todayNumber - dayNumber;
    if (daysAgo >= 0 && daysAgo <= 6) {
      activeThisWeek += 1;
    }
  }

  return activeThisWeek;
}

/** Overall correctness rate (0–100): correct ÷ attempted across lessons and practice. */
export function getOverallAccuracy(progress: LessonProgress) {
  const attempted = getQuestionsAttemptedCount(progress);

  if (attempted === 0) {
    return 0;
  }

  return Math.round((100 * getQuestionsAnsweredCorrectlyCount(progress)) / attempted);
}

/**
 * Total questions attempted across lessons and practice: every recorded
 * submission plus awarded lesson questions without one, each counted once.
 */
export function getQuestionsAttemptedCount(progress: LessonProgress) {
  const attempts = progress.questionAttempts ?? {};
  let total = Object.values(attempts).reduce(
    (sum, stats) => sum + stats.correct + stats.incorrect,
    0,
  );

  for (const questionIds of Object.values(progress.awardedQuestionIds ?? {})) {
    for (const questionId of questionIds) {
      if (!attempts[questionId]) {
        total += 1;
      }
    }
  }

  return total;
}

/**
 * Total questions answered correctly across lessons and practice: every correct
 * submission plus awarded lesson questions without one, each counted once.
 */
export function getQuestionsAnsweredCorrectlyCount(progress: LessonProgress) {
  const attempts = progress.questionAttempts ?? {};
  let total = Object.values(attempts).reduce((sum, stats) => sum + stats.correct, 0);

  for (const questionIds of Object.values(progress.awardedQuestionIds ?? {})) {
    for (const questionId of questionIds) {
      if (!attempts[questionId]?.correct) {
        total += 1;
      }
    }
  }

  return total;
}

/** Whole study minutes recorded against a single lesson. */
export function getLessonTimeMinutes(progress: LessonProgress, lessonId: string) {
  return getStudyMinutesFromMilliseconds(progress.lessonTimeSpentMs?.[lessonId] ?? 0);
}

/** Human-friendly minutes: "45 min" under an hour, "2h 15m" beyond. */
export function formatMinutes(totalMinutes: number) {
  const safeMinutes =
    Number.isFinite(totalMinutes) && totalMinutes > 0 ? Math.floor(totalMinutes) : 0;

  if (safeMinutes < 60) {
    return `${safeMinutes} min`;
  }

  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Formats a completion timestamp as "Jun 23" in the viewer's LOCAL timezone, so a
 * late-evening completion isn't rolled to the next day by UTC.
 */
export function formatCompletionDate(isoTimestamp: string | undefined): string | null {
  if (typeof isoTimestamp !== 'string' || !isoTimestamp) {
    return null;
  }

  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${MONTH_ABBREVIATIONS[date.getMonth()]} ${date.getDate()}`;
}

/* In-tab pub/sub so every useLessonProgress instance shares one live view: a
 * write broadcasts to the rest (else a long-lived HUD shows stale XP). Cross-tab
 * sync flows through Firestore. */
type ProgressListener = (progress: LessonProgress) => void;
const progressListeners = new Set<ProgressListener>();

function broadcastProgress(nextProgress: LessonProgress) {
  for (const listener of progressListeners) {
    listener(nextProgress);
  }
}

/**
 * Wipes local progress and resets mounted hooks to empty, so a deleted account's
 * progress can't linger or merge into the next sign-in. Local-only; Firestore is
 * cleared separately.
 */
export function clearLocalLessonProgress() {
  clearLessonProgress();
  clearTestDayOffset();
  broadcastProgress({ ...emptyProgress });
}

export function useLessonProgress(lessons: Lesson[], userId?: string | null) {
  const [progress, setProgress] = useState(readLessonProgress);
  const [progressSyncError, setProgressSyncError] = useState<string | null>(null);
  const [testDayOffset, setTestDayOffset] = useState(readTestDayOffset);
  const progressRef = useRef(progress);
  const saveQueueRef = useRef(Promise.resolve());

  // Stay in sync with writes from sibling instances in the same tab.
  useEffect(() => {
    const listener: ProgressListener = (nextProgress) => {
      if (areLessonProgressEqual(progressRef.current, nextProgress)) {
        return;
      }

      progressRef.current = nextProgress;
      setProgress(nextProgress);
    };

    progressListeners.add(listener);
    return () => {
      progressListeners.delete(listener);
    };
  }, []);
  const { completedLessonIds } = progress;
  const testTodayKey = useMemo(() => getTodayKey(testDayOffset), [testDayOffset]);
  const sequencedLessons = useMemo(
    () => getSequencedLessons(lessons, completedLessonIds),
    [completedLessonIds, lessons],
  );
  const currentStreakDays = useMemo(
    () => getCurrentStreakDays(progress.dailyCompletionDates, testTodayKey),
    [progress.dailyCompletionDates, testTodayKey],
  );
  /* Whether today's slot is secured; when false the streak only reaches yesterday. */
  const streakCompletedToday = useMemo(
    () => progress.dailyCompletionDates.includes(testTodayKey),
    [progress.dailyCompletionDates, testTodayKey],
  );
  const minutesToday = progress.dailyStudyMinutes?.[testTodayKey] ?? 0;

  function enqueueProgressSave(
    firestore: NonNullable<typeof db>,
    currentUserId: string,
    nextProgress: LessonProgress,
    errorMessage: string,
  ) {
    const saveTask = saveQueueRef.current
      .catch(() => undefined)
      .then(() => saveUserLessonProgress(firestore, currentUserId, nextProgress));

    saveQueueRef.current = saveTask;

    /* Best-effort mirror of total XP to the leaderboard after a save. Runs detached
     * (not awaited / not in saveQueueRef) so a failure never affects progress saving;
     * the next save self-heals the row. */
    saveTask
      .then(() => syncLeaderboardEntry(firestore, currentUserId, nextProgress.totalXp))
      .catch(() => undefined);

    return saveTask
      .then(() => setProgressSyncError(null))
      .catch(() => setProgressSyncError(errorMessage));
  }

  useEffect(() => {
    if (!db || !userId) {
      return undefined;
    }

    const firestore = db;
    const currentUserId = userId;
    let isCurrent = true;

    async function syncProgressFromFirestore() {
      try {
        const remoteProgress = await loadUserLessonProgress(firestore, currentUserId);

        if (!isCurrent) {
          return;
        }

        const localProgress = progressRef.current;
        const nextProgress = remoteProgress
          ? mergeLessonProgress(remoteProgress, localProgress)
          : localProgress;

        progressRef.current = nextProgress;
        setProgress(nextProgress);
        writeLessonProgress(nextProgress);
        broadcastProgress(nextProgress);
        setProgressSyncError(null);

        if (shouldSaveMergedProgress(remoteProgress, localProgress, nextProgress)) {
          await enqueueProgressSave(
            firestore,
            currentUserId,
            nextProgress,
            'Could not sync progress to Firestore. Local progress is still saved.',
          );
        }
      } catch {
        if (isCurrent) {
          setProgressSyncError('Could not sync progress to Firestore. Local progress is still saved.');
        }
      }
    }

    void syncProgressFromFirestore();

    return () => {
      isCurrent = false;
    };
  }, [userId]);

  function persistProgress(nextProgress: LessonProgress) {
    progressRef.current = nextProgress;
    writeLessonProgress(nextProgress);
    broadcastProgress(nextProgress);

    if (!db || !userId) {
      return;
    }

    void enqueueProgressSave(
      db,
      userId,
      nextProgress,
      'Could not sync progress to Firestore. Local progress is still saved.',
    );
  }

  function completeLesson(lessonId: string, questionIds: string[]) {
    const result = completeLessonInProgress(
      progressRef.current,
      lessonId,
      questionIds,
      testTodayKey,
    );
    setProgress(result.progress);
    persistProgress(result.progress);
    return result.award;
  }

  function awardQuestion(lessonId: string, questionId: string) {
    const result = awardQuestionInProgress(progressRef.current, lessonId, questionId);
    setProgress(result.progress);
    persistProgress(result.progress);
    return result.xpGained;
  }

  function saveLessonResumeState(lessonId: string, resumeState: LessonResumeState) {
    const nextProgress = normalizeProgress({
      ...progressRef.current,
      lessonResumeStates: {
        ...progressRef.current.lessonResumeStates,
        [lessonId]: resumeState,
      },
    });
    setProgress(nextProgress);
    persistProgress(nextProgress);
  }

  function clearLessonResumeState(lessonId: string) {
    const lessonResumeStates = { ...(progressRef.current.lessonResumeStates ?? {}) };
    delete lessonResumeStates[lessonId];
    const nextProgress = normalizeProgress({
      ...progressRef.current,
      lessonResumeStates,
    });
    setProgress(nextProgress);
    persistProgress(nextProgress);
  }

  /* Records elapsed study time into both daily-minutes and per-lesson totals. */
  function addStudyTime(lessonId: string, millisecondsSpent: number) {
    const nextProgress = addStudyTimeInProgress(
      progressRef.current,
      testTodayKey,
      lessonId,
      millisecondsSpent,
    );
    setProgress(nextProgress);
    persistProgress(nextProgress);
  }

  function recordQuestionAttempt(questionId: string, isCorrect: boolean) {
    const nextProgress = recordQuestionAttemptInProgress(
      progressRef.current,
      questionId,
      isCorrect,
    );
    setProgress(nextProgress);
    persistProgress(nextProgress);
  }

  /* Records a full response (attempt + topicStats + recentMistakes) via
   * persistProgress, so it survives offline and reconciles on reconnect. */
  function recordResponse(context: ResponseContext) {
    const nextProgress = recordResponseInProgress(progressRef.current, context);
    setProgress(nextProgress);
    persistProgress(nextProgress);
  }

  function awardPracticeQuestion(isCorrect: boolean, options?: AwardPracticeQuestionOptions) {
    const result = awardPracticeQuestionInProgress(
      progressRef.current,
      isCorrect,
      testTodayKey,
      options,
    );
    setProgress(result.progress);
    persistProgress(result.progress);
    return result.award;
  }

  /* Awards DOUBLE XP + coins for a correct challenge answer; records no
   * history (questions are AI-generated). */
  function awardChallengeQuestion(isCorrect: boolean) {
    const result = awardChallengeQuestionInProgress(progressRef.current, isCorrect);
    setProgress(result.progress);
    persistProgress(result.progress);
    return result.award;
  }

  // Daily-only study time (no per-lesson bucket) for practice sessions.
  function addPracticeStudyTime(millisecondsSpent: number) {
    const nextProgress = addDailyStudyMinutesInProgress(
      progressRef.current,
      testTodayKey,
      millisecondsSpent,
    );
    setProgress(nextProgress);
    persistProgress(nextProgress);
  }

  function advanceTestDay() {
    setTestDayOffset((currentOffset) => {
      const nextOffset = currentOffset + 1;
      writeTestDayOffset(nextOffset);
      return nextOffset;
    });
  }

  function resetProgress() {
    const clearedProgress = { ...emptyProgress };
    progressRef.current = clearedProgress;
    setProgress(clearedProgress);
    broadcastProgress(clearedProgress);
    setTestDayOffset(0);
    clearLessonProgress();
    clearTestDayOffset();

    if (db && userId) {
      void deleteUserLessonProgress(db, userId)
        .then(() => setProgressSyncError(null))
        .catch(() =>
          setProgressSyncError('Could not reset Firestore progress. Local progress was reset.'),
        );
    }
  }

  return {
    addPracticeStudyTime,
    addStudyTime,
    advanceTestDay,
    awardChallengeQuestion,
    awardPracticeQuestion,
    awardQuestion,
    completeLesson,
    completedLessonIds,
    currentStreakDays,
    clearLessonResumeState,
    minutesToday,
    progress,
    progressSyncError,
    recordQuestionAttempt,
    recordResponse,
    resetProgress,
    saveLessonResumeState,
    sequencedLessons,
    streakCompletedToday,
    testDayOffset,
    testTodayKey,
  };
}
