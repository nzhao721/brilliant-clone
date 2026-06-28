import { Navigate, Outlet } from 'react-router-dom';
import { lessons } from '../data/lessons';
import { getQuestionsForLessons } from '../data/questionBank';
import { isDailyGateActive } from '../lessons/dailyGate';
import { useLessonProgress } from '../lessons/lessonProgress';
import { useAuth } from './AuthContext';

/*
 * Enforces the DAILY-REQUIRED mixed-practice gate. Mirrors ProtectedRoute and is
 * nested INSIDE it: once a learner has completed a lesson, every gated route
 * (lessons, games, race, dashboard, analytics) redirects to /practice until they
 * pass today's 85% practice. `/practice` itself sits OUTSIDE this guard so it is
 * always reachable.
 */
export function DailyGateRoute() {
  const { user } = useAuth();
  const { progress, testTodayKey } = useLessonProgress(lessons, user?.uid);

  /* FAIL-SAFE: never permanently trap a learner. We only redirect to /practice
   * when we can POSITIVELY confirm an active gate that PracticePage can actually
   * turn into a passable required set. Anything else — a still-loading/empty/
   * malformed progress, no eligible questions, or an unexpected error — degrades
   * to ungated (render the child) instead of an inescapable /practice redirect. */
  let gated = false;
  try {
    /* Mirror PracticePage's gate-mode eligibility EXACTLY: only lessons that still
     * exist in the live course count. Gating on the raw persisted completedLessonIds
     * instead would let the guards disagree — DailyGateRoute redirects to /practice
     * while PracticePage shows its "complete a lesson"/"no questions" screen whose
     * only link points back into the gate, looping forever. */
    const completedInCourse = lessons
      .filter((lesson) => progress.completedLessonIds?.includes(lesson.id))
      .map((lesson) => lesson.id);

    gated =
      isDailyGateActive(progress, testTodayKey) &&
      getQuestionsForLessons(completedInCourse).length > 0;
  } catch {
    // A corrupt/unexpected progress shape must open the app, never wall it off.
    gated = false;
  }

  if (gated) {
    return <Navigate to="/practice" replace />;
  }

  return <Outlet />;
}
