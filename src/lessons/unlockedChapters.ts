/*
 * Question unlock for the Fuel Race (bot mode). Questions are tagged by chapterId,
 * so a chapter's questions unlock once the player completes one lesson in it (via
 * isChapterPracticeAvailable); the bot pool is their union. Online mode ignores
 * this and races the full bank.
 */

import { chapters } from '../data/chapters';
import { getChapterLessons } from '../data/lessons';
import { isChapterPracticeAvailable } from './lessonProgress';

/**
 * Ids of chapters where the learner has completed at least one lesson, in course
 * order. Feed to getQuestionsForChapters to build the bot pool; empty = locked.
 */
export function getUnlockedChapterIds(completedLessonIds: string[]): string[] {
  return chapters
    .filter((chapter) =>
      isChapterPracticeAvailable(getChapterLessons(chapter.id), completedLessonIds),
    )
    .map((chapter) => chapter.id);
}
