import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lesson, LessonStatus } from '../data/lessons';
import { db } from '../lib/firebase';
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
// Progressive leveling curve (Level 1 starts at 0 XP). Advancing FROM a level
// costs `xpLevelStep` more XP than the previous one: Level 1 → 2 costs 100 XP,
// 2 → 3 costs 150, 3 → 4 costs 200, and so on — so higher levels take more XP.
export const xpBasePerLevel = 100;
export const xpLevelStep = 50;

export type QuestionAttemptStats = {
  correct: number;
  incorrect: number;
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
  totalXp: number;
};

export type SavedQuestionState = {
  selectedOptionId: string;
  answerResult: 'correct' | 'incorrect' | null;
  showHint: boolean;
};

export type LessonResumeState = {
  stepIndex: number;
  questionStates: Record<string, SavedQuestionState>;
};

export type LessonCompletionAward = {
  alreadyCompleted: boolean;
  questionsAnswered: number;
  lessonXp: number;
  dailyBonusXp: number;
  totalXpGained: number;
};

export type SequencedLesson = Lesson & {
  sequenceNumber: number;
  status: LessonStatus;
  lockedReason?: string;
};

export type XpLevel = {
  level: number;
  xpIntoLevel: number;
  xpForLevel: number;
  xpToNextLevel: number;
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
  totalXp: 0,
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

  return {
    questionStates,
    stepIndex,
  };
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

    // Drop entries with no recorded attempts so the map only tracks attempted
    // questions (keeps the avg-attempts denominator honest).
    if (correct === 0 && incorrect === 0) {
      continue;
    }

    questionAttempts[questionId] = { correct, incorrect };
  }

  return questionAttempts;
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
    totalXp: typeof progress.totalXp === 'number' ? progress.totalXp : 0,
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

  // Per-question attempts: take the max of each counter so re-syncing the same
  // device never double-counts (mirrors the dailyStudyMinutes max-merge).
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

  // Per-lesson time: max-merge for the same no-double-count reason.
  const lessonTimeSpentMs = { ...normalizedRemoteProgress.lessonTimeSpentMs };

  for (const [lessonId, milliseconds] of Object.entries(
    normalizedLocalProgress.lessonTimeSpentMs ?? {},
  )) {
    lessonTimeSpentMs[lessonId] = Math.max(lessonTimeSpentMs[lessonId] ?? 0, milliseconds);
  }

  // First-completion timestamps: keep the earliest across remote/local. ISO 8601
  // UTC strings sort chronologically, so a lexical min is the earliest moment.
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
    totalXp: Math.max(normalizedRemoteProgress.totalXp, normalizedLocalProgress.totalXp),
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

export function getLessonQuestionCount(lesson: Lesson) {
  return lesson.steps.filter((step) => step.type === 'multiple-choice').length;
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
    };
  }

  const awardedQuestionIds = {
    ...nextProgress.awardedQuestionIds,
    [lessonId]: [...awardedLessonQuestionIds, questionId],
  };

  return {
    alreadyAwarded: false,
    progress: {
      ...nextProgress,
      awardedQuestionIds,
      totalXp: nextProgress.totalXp + questionCompletionXp,
    },
    xpGained: questionCompletionXp,
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
  const progressWithXp = {
    ...nextProgress,
    totalXp: nextProgress.totalXp + dailyBonusXp,
  };

  return {
    award: {
      alreadyCompleted: false,
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
};

/**
 * Awards XP for one practice answer and keeps the daily streak alive. A correct
 * answer earns `practiceQuestionXp`. The first practice/lesson activity of a day
 * also registers that day for the streak and grants the streak bonus (streak
 * length × `dailyStreakBonusXp`), exactly like finishing a lesson. Practice
 * shares `dailyCompletionDates` with lessons, so the daily bonus is granted once
 * per day regardless of which activity comes first.
 */
export function awardPracticeQuestionInProgress(
  progress: LessonProgress,
  isCorrect: boolean,
  activityDate = getTodayKey(),
): { award: PracticeAnswerAward; progress: LessonProgress } {
  const baseProgress = normalizeProgress(progress);
  const questionXp = isCorrect ? practiceQuestionXp : 0;
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
    },
    progress: normalizeProgress({
      ...baseProgress,
      dailyCompletionDates,
      totalXp: baseProgress.totalXp + totalXpGained,
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
 * Records one answer submission for a question. Increments the `correct` or
 * `incorrect` counter by exactly one — call this on every actual submit click
 * (not on resume/re-render) so accuracy reflects real attempts.
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

/**
 * Records study time in one pass: the same elapsed milliseconds feed both the
 * existing daily-minutes total and the additive per-lesson millisecond total.
 */
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

/**
 * XP required to advance FROM `level` to the next one. Grows by `xpLevelStep`
 * each level: Level 1 → 2 = 100 XP, 2 → 3 = 150, 3 → 4 = 200, ...
 */
export function getXpForLevel(level: number) {
  const safeLevel = Number.isFinite(level) && level > 1 ? Math.floor(level) : 1;
  return xpBasePerLevel + (safeLevel - 1) * xpLevelStep;
}

/** Maps total XP onto the progressive leveling curve (Level 1 starts at 0 XP). */
export function getXpLevel(totalXp: number): XpLevel {
  const safeXp = Number.isFinite(totalXp) && totalXp > 0 ? Math.floor(totalXp) : 0;

  let level = 1;
  let xpIntoLevel = safeXp;
  let xpForLevel = getXpForLevel(level);

  // Walk up the curve, subtracting each level's (increasing) cost until the
  // remaining XP no longer fills the current level.
  while (xpIntoLevel >= xpForLevel) {
    xpIntoLevel -= xpForLevel;
    level += 1;
    xpForLevel = getXpForLevel(level);
  }

  return {
    level,
    xpIntoLevel,
    xpForLevel,
    xpToNextLevel: xpForLevel - xpIntoLevel,
  };
}

/**
 * Overall correctness rate (0–100), kept consistent with the attempted /
 * answered-correctly analytics: correct ÷ attempted across BOTH lessons and
 * practice (so e.g. 20 attempted / 20 correct reads 100%, not 0%).
 */
export function getOverallAccuracy(progress: LessonProgress) {
  const attempted = getQuestionsAttemptedCount(progress);

  if (attempted === 0) {
    return 0;
  }

  return Math.round((100 * getQuestionsAnsweredCorrectlyCount(progress)) / attempted);
}

/** Average submissions per attempted question, rounded to one decimal place. */
export function getAverageAttemptsPerQuestion(progress: LessonProgress) {
  const attemptedQuestions = Object.values(progress.questionAttempts ?? {}).filter(
    (stats) => stats.correct + stats.incorrect > 0,
  );

  if (attemptedQuestions.length === 0) {
    return 0;
  }

  const totalAttempts = attemptedQuestions.reduce(
    (total, stats) => total + stats.correct + stats.incorrect,
    0,
  );

  return Math.round((totalAttempts / attemptedQuestions.length) * 10) / 10;
}

/** Count of correctly-answered (XP-awarded) questions across all lessons. */
export function getQuestionsMasteredCount(progress: LessonProgress) {
  return Object.values(progress.awardedQuestionIds ?? {}).reduce(
    (total, questionIds) => total + questionIds.length,
    0,
  );
}

/**
 * Total questions attempted across BOTH lessons and practice. Counts every
 * recorded submission (practice + answered lesson questions), then adds any
 * completed/awarded lesson questions that have no recorded submission (e.g.
 * lessons finished via the shortcut, or progress saved before attempts were
 * tracked) — each counted once, never double-counting answered questions.
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
 * Total questions answered correctly across BOTH lessons and practice. Counts
 * every correct submission (practice + answered lesson questions) plus any
 * completed/awarded lesson questions without a recorded correct submission,
 * each counted once.
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

/** Total number of multiple-choice questions across the provided lessons. */
export function getTotalQuestionCount(lessons: Lesson[]) {
  return lessons.reduce((total, lesson) => total + getLessonQuestionCount(lesson), 0);
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
 * Formats a completion timestamp as "Jun 23" in the viewer's LOCAL timezone.
 * The stored timestamp is UTC; reading its UTC date would roll a late-evening
 * completion in a behind-UTC timezone onto the next day (e.g. 8pm Jun 23 PDT is
 * Jun 24 UTC). Converting to local shows the day the lesson was actually done.
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

// In-tab pub/sub so every useLessonProgress instance shares one live view of
// progress. Each component (e.g. the header HUD and a page body) keeps its own
// useState, but a write from any instance is broadcast to the rest — otherwise a
// long-lived consumer like the header shows stale XP after another instance
// writes an update. Cross-tab sync still flows through Firestore.
type ProgressListener = (progress: LessonProgress) => void;
const progressListeners = new Set<ProgressListener>();

function broadcastProgress(nextProgress: LessonProgress) {
  for (const listener of progressListeners) {
    listener(nextProgress);
  }
}

/**
 * Wipes locally-stored progress and resets any mounted hooks to empty. Used
 * after permanently deleting an account so the deleted user's progress can't
 * linger on the device or merge into the next account signed in here. This is
 * local-only; remote (Firestore) data is removed separately during deletion.
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
  // Whether a lesson has already been completed today. The streak is built from
  // dailyCompletionDates, so this is what tells us if today's slot is secured or
  // if the streak currently only reaches through yesterday (at risk).
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

  // Records elapsed study time once into BOTH the daily-minutes total and the
  // per-lesson millisecond total. Replaces the old daily-only helper.
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

  function awardPracticeQuestion(isCorrect: boolean) {
    const result = awardPracticeQuestionInProgress(progressRef.current, isCorrect, testTodayKey);
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
    resetProgress,
    saveLessonResumeState,
    sequencedLessons,
    streakCompletedToday,
    testDayOffset,
    testTodayKey,
  };
}
