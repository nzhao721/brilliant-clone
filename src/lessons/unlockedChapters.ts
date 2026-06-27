// Lesson-level question unlock for the Fuel Race (bot mode).
//
// Questions are tagged by chapterId only (no per-lesson tag), so "unlock as you
// complete lessons" is modeled at chapter granularity: a chapter's questions
// become available as soon as the player has completed AT LEAST ONE lesson in
// it. The bot race draws its pool from the union of these chapters' questions,
// so finishing more lessons progressively widens the pool.
//
// This reuses the existing per-chapter availability rule (isChapterPracticeAvailable)
// so the "one completed lesson" definition stays in one place. Online mode does
// NOT use this — it always races the full question bank.

import { chapters } from '../data/chapters';
import { getChapterLessons } from '../data/lessons';
import { isChapterPracticeAvailable } from './lessonProgress';

/**
 * Ids of the chapters in which the learner has completed at least one lesson, in
 * course order. Feed these to getQuestionsForChapters to build the bot pool. An
 * empty result means no lesson is complete yet (the bot race stays locked).
 */
export function getUnlockedChapterIds(completedLessonIds: string[]): string[] {
  return chapters
    .filter((chapter) =>
      isChapterPracticeAvailable(getChapterLessons(chapter.id), completedLessonIds),
    )
    .map((chapter) => chapter.id);
}
