// Practice question bank aggregator. The `PracticeQuestion` type lives here and
// the flat `questionBank` is assembled from per-chapter modules in
// ./chapterQuestions, ordered by ./chapters. Per-chapter modules import the
// `PracticeQuestion` type from here with `import type`, so there is no runtime
// cycle.

import { chapters } from './chapters';
import { lessons } from './lessons';
import { limitsQuestions } from './chapterQuestions/limits';
import { derivativesQuestions } from './chapterQuestions/derivatives';
import { behaviorOfFunctionsQuestions } from './chapterQuestions/behavior-of-functions';
import { applicationsOfDerivativesQuestions } from './chapterQuestions/applications-of-derivatives';
import { integrationQuestions } from './chapterQuestions/integration';
import { techniquesOfIntegrationQuestions } from './chapterQuestions/techniques-of-integration';
import { applicationsOfIntegrationQuestions } from './chapterQuestions/applications-of-integration';
import { sequencesAndSeriesQuestions } from './chapterQuestions/sequences-and-series';
import { parametricAndPolarQuestions } from './chapterQuestions/parametric-and-polar';

export type PracticeChoice = {
  id: string;
  label: string;
};

export type PracticeQuestion = {
  id: string;
  /** Chapter this question belongs to (matches a Chapter.id in ./chapters). */
  chapterId: string;
  /**
   * Lesson this question belongs to (matches a Lesson.id in ./lessons). Optional
   * on the per-chapter source modules so the generators don't each have to set
   * it; the aggregator below attaches a concrete lessonId to every question in
   * `questionBank` from the chapter + category grouping.
   */
  lessonId?: string;
  /** Finer-grained topic label within the chapter. */
  category: string;
  prompt: string;
  choices: PracticeChoice[];
  correctChoiceId: string;
  explanation: string;
  /**
   * Authored difficulty on a 1 (easiest) to 5 (hardest) scale. Optional on the
   * type so the per-chapter source modules keep compiling while difficulties are
   * filled in; every question in the assembled bank is tagged (a unit test
   * enforces integer 1–5 coverage).
   */
  difficulty?: number;
};

export type RandomNumberGenerator = () => number;

const questionsByChapterId: Record<string, PracticeQuestion[]> = {
  limits: limitsQuestions,
  derivatives: derivativesQuestions,
  'behavior-of-functions': behaviorOfFunctionsQuestions,
  'applications-of-derivatives': applicationsOfDerivativesQuestions,
  integration: integrationQuestions,
  'techniques-of-integration': techniquesOfIntegrationQuestions,
  'applications-of-integration': applicationsOfIntegrationQuestions,
  'sequences-and-series': sequencesAndSeriesQuestions,
  'parametric-and-polar': parametricAndPolarQuestions,
};

// Maps each "<chapterId>\0<category>" to the lessonId it belongs to. Within a
// chapter the distinct question categories appear in lesson order (each section's
// questions are authored grouped and in the same order as the lessons), so the
// i-th distinct category maps to the i-th lesson. If a chapter ever has more
// categories than lessons, extras fall back to the last lesson rather than going
// unmapped. A unit test asserts every question resolves to a real lesson.
const LESSON_ID_KEY_SEP = '\u0000';

function buildLessonIdByCategory(): Map<string, string> {
  const map = new Map<string, string>();

  for (const chapter of chapters) {
    const chapterLessons = lessons.filter((lesson) => lesson.chapterId === chapter.id);
    if (chapterLessons.length === 0) {
      continue;
    }

    const orderedCategories: string[] = [];
    for (const question of questionsByChapterId[chapter.id] ?? []) {
      if (!orderedCategories.includes(question.category)) {
        orderedCategories.push(question.category);
      }
    }

    orderedCategories.forEach((category, index) => {
      const lesson = chapterLessons[Math.min(index, chapterLessons.length - 1)];
      map.set(`${chapter.id}${LESSON_ID_KEY_SEP}${category}`, lesson.id);
    });
  }

  return map;
}

const lessonIdByCategory = buildLessonIdByCategory();

/** The lessonId a (chapterId, category) pair maps to, if any. */
export function resolveQuestionLessonId(chapterId: string, category: string): string | undefined {
  return lessonIdByCategory.get(`${chapterId}${LESSON_ID_KEY_SEP}${category}`);
}

export const questionBank: PracticeQuestion[] = chapters.flatMap((chapter) =>
  (questionsByChapterId[chapter.id] ?? []).map((question) => ({
    ...question,
    lessonId: question.lessonId ?? resolveQuestionLessonId(chapter.id, question.category),
  })),
);

/** All practice questions tagged to a given chapter. */
export function getPracticeQuestionsForChapter(
  chapterId: string,
  sourceQuestions: readonly PracticeQuestion[] = questionBank,
): PracticeQuestion[] {
  return sourceQuestions.filter((question) => question.chapterId === chapterId);
}

/**
 * Union of practice questions across several chapters (e.g. every chapter the
 * learner has started). An empty input yields an empty pool; unknown chapter
 * ids contribute nothing.
 */
export function getQuestionsForChapters(
  chapterIds: Iterable<string>,
  sourceQuestions: readonly PracticeQuestion[] = questionBank,
): PracticeQuestion[] {
  const chapterIdSet = new Set(chapterIds);

  if (chapterIdSet.size === 0) {
    return [];
  }

  return sourceQuestions.filter((question) => chapterIdSet.has(question.chapterId));
}

/**
 * Union of practice questions across several lessons (e.g. every lesson the
 * learner has completed). An empty input yields an empty pool; questions whose
 * lessonId isn't in the set (or is unset) contribute nothing. This is the
 * lesson-granular counterpart to getQuestionsForChapters and backs the unified
 * practice pool, which unlocks per completed lesson rather than per chapter.
 */
export function getQuestionsForLessons(
  lessonIds: Iterable<string>,
  sourceQuestions: readonly PracticeQuestion[] = questionBank,
): PracticeQuestion[] {
  const lessonIdSet = new Set(lessonIds);

  if (lessonIdSet.size === 0) {
    return [];
  }

  return sourceQuestions.filter(
    (question) => question.lessonId != null && lessonIdSet.has(question.lessonId),
  );
}

export function createSeededRng(seed: number): RandomNumberGenerator {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomIndex(length: number, rng: RandomNumberGenerator) {
  return Math.min(Math.floor(rng() * length), length - 1);
}

export function pickRandomQuestions(
  sourceQuestions: readonly PracticeQuestion[] = questionBank,
  count = 10,
  rng: RandomNumberGenerator = Math.random,
) {
  const shuffled = [...sourceQuestions];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, rng);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, Math.max(0, Math.min(count, shuffled.length)));
}

export function pickNextQuestion(
  sourceQuestions: readonly PracticeQuestion[] = questionBank,
  previousQuestionId?: string,
  rng: RandomNumberGenerator = Math.random,
) {
  const eligibleQuestions =
    sourceQuestions.length > 1
      ? sourceQuestions.filter((question) => question.id !== previousQuestionId)
      : [...sourceQuestions];

  return eligibleQuestions[randomIndex(eligibleQuestions.length, rng)];
}
