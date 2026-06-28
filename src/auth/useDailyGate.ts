import { lessons } from '../data/lessons';
import { getQuestionsForLessons } from '../data/questionBank';
import { DAILY_GATE_ENABLED, isDailyGateActive } from '../lessons/dailyGate';
import { useLessonProgress } from '../lessons/lessonProgress';
import { useAuth } from './AuthContext';

export type DailyGateState = {
  /**
   * True ONLY when we can POSITIVELY confirm an active gate that PracticePage can
   * turn into a passable required set (flag on + gate active + completed-in-course
   * lessons yield practice questions). Anything else — still-loading/empty/malformed
   * progress, no eligible questions, or an unexpected error — degrades to `false`,
   * so callers fall back to rendering their normal content (never an inescapable wall).
   */
  gated: boolean;
  /**
   * The learner's completed lesson ids intersected with the LIVE course (stale ids
   * from renamed/removed lessons dropped), as a Set. Lets a caller decide per-lesson
   * whether a route may still be reviewed while gated.
   */
  completedInCourseIds: Set<string>;
};

/**
 * Shared evaluation of the DAILY-REQUIRED mixed-practice gate, used by every gate
 * guard (DailyGateRoute for games/race, LessonGate for lessons). Mirrors
 * PracticePage's gate-mode eligibility EXACTLY: only lessons that still exist in
 * the live course count, so the guards and PracticePage never disagree (which would
 * otherwise loop a learner between a redirect and a "complete a lesson" screen).
 */
export function useDailyGate(): DailyGateState {
  const { user } = useAuth();
  const { progress, testTodayKey } = useLessonProgress(lessons, user?.uid);

  let gated = false;
  let completedInCourseIds = new Set<string>();

  try {
    const completedInCourse = lessons
      .filter((lesson) => progress.completedLessonIds?.includes(lesson.id))
      .map((lesson) => lesson.id);
    completedInCourseIds = new Set(completedInCourse);

    /* DAILY_GATE_ENABLED is the master switch: when off the gate is never enforced. */
    gated =
      DAILY_GATE_ENABLED &&
      isDailyGateActive(progress, testTodayKey) &&
      getQuestionsForLessons(completedInCourse).length > 0;
  } catch {
    // A corrupt/unexpected progress shape must open the app, never wall it off.
    gated = false;
    completedInCourseIds = new Set<string>();
  }

  return { gated, completedInCourseIds };
}
