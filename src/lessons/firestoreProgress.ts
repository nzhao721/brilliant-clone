import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import type {
  LessonProgress,
  LessonResumeState,
  QuestionAttemptStats,
  RecentMistake,
  SavedQuestionState,
  TopicStat,
} from './lessonProgress';

const userProgressCollectionPath = 'learning';
const userProgressDocumentId = 'progress';
// Mirrors recentMistakesLimit in lessonProgress.ts. Kept as a local copy so this
// serialization module stays self-contained (it intentionally duplicates the
// normalizers rather than importing runtime values from lessonProgress).
const recentMistakesLimit = 25;

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function normalizeSavedQuestionState(value: unknown): SavedQuestionState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const questionState = value as Partial<SavedQuestionState>;
  const answerResult =
    questionState.answerResult === 'correct' || questionState.answerResult === 'incorrect'
      ? questionState.answerResult
      : null;

  return {
    answerResult,
    selectedOptionId:
      typeof questionState.selectedOptionId === 'string' ? questionState.selectedOptionId : '',
    showHint: Boolean(questionState.showHint),
  };
}

function normalizeLessonResumeState(value: unknown): LessonResumeState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const resumeState = value as Partial<LessonResumeState>;
  const questionStates: Record<string, SavedQuestionState> = {};

  if (resumeState.questionStates && typeof resumeState.questionStates === 'object') {
    for (const [questionId, questionState] of Object.entries(resumeState.questionStates)) {
      const normalizedQuestionState = normalizeSavedQuestionState(questionState);

      if (normalizedQuestionState) {
        questionStates[questionId] = normalizedQuestionState;
      }
    }
  }

  return {
    questionStates,
    stepIndex:
      typeof resumeState.stepIndex === 'number' && Number.isFinite(resumeState.stepIndex)
        ? Math.max(0, Math.floor(resumeState.stepIndex))
        : 0,
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

    if (correct === 0 && incorrect === 0) {
      continue;
    }

    questionAttempts[questionId] = { correct, incorrect };
  }

  return questionAttempts;
}

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

    if (correct === 0 && incorrect === 0) {
      continue;
    }

    topicStats[topicKey] = { correct, incorrect };
  }

  return topicStats;
}

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

export function normalizeFirestoreLessonProgress(value: unknown): LessonProgress {
  const progress = value && typeof value === 'object' ? (value as Partial<LessonProgress>) : {};

  return {
    awardedQuestionIds: normalizeAwardedQuestionIds(progress.awardedQuestionIds),
    completedLessonIds: uniqueValues(
      Array.isArray(progress.completedLessonIds)
        ? progress.completedLessonIds.filter((lessonId) => typeof lessonId === 'string')
        : [],
    ),
    dailyCompletionDates: uniqueValues(
      Array.isArray(progress.dailyCompletionDates)
        ? progress.dailyCompletionDates.filter((dateKey) => typeof dateKey === 'string')
        : [],
    ),
    dailyStudyMinutes: normalizeDailyStudyMinutes(progress.dailyStudyMinutes),
    lessonCompletedAt: normalizeLessonCompletedAt(progress.lessonCompletedAt),
    lessonResumeStates: normalizeLessonResumeStates(progress.lessonResumeStates),
    lessonTimeSpentMs: normalizeLessonTimeSpentMs(progress.lessonTimeSpentMs),
    questionAttempts: normalizeQuestionAttempts(progress.questionAttempts),
    topicStats: normalizeTopicStats(progress.topicStats),
    recentMistakes: normalizeRecentMistakes(progress.recentMistakes),
    totalXp: typeof progress.totalXp === 'number' && Number.isFinite(progress.totalXp)
      ? Math.max(0, Math.floor(progress.totalXp))
      : 0,
    // Lifetime coins earned is its own accumulation (no longer derived from XP),
    // so it must round-trip through Firestore alongside totalXp.
    totalCoinsEarned:
      typeof progress.totalCoinsEarned === 'number' && Number.isFinite(progress.totalCoinsEarned)
        ? Math.max(0, Math.floor(progress.totalCoinsEarned))
        : 0,
  };
}

function getUserProgressDocRef(firestore: Firestore, userId: string) {
  return doc(firestore, 'users', userId, userProgressCollectionPath, userProgressDocumentId);
}

export async function loadUserLessonProgress(firestore: Firestore, userId: string) {
  const snapshot = await getDoc(getUserProgressDocRef(firestore, userId));

  if (!snapshot.exists()) {
    return null;
  }

  return normalizeFirestoreLessonProgress(snapshot.data());
}

export async function saveUserLessonProgress(
  firestore: Firestore,
  userId: string,
  progress: LessonProgress,
) {
  await setDoc(
    getUserProgressDocRef(firestore, userId),
    {
      ...normalizeFirestoreLessonProgress(progress),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function deleteUserLessonProgress(firestore: Firestore, userId: string) {
  await deleteDoc(getUserProgressDocRef(firestore, userId));
}
