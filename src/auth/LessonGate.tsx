import { useParams } from 'react-router-dom';
import { DailyGateBlockedScreen } from '../components/DailyGateBlockedScreen';
import { LessonPage } from '../pages/LessonPage';
import { useDailyGate } from './useDailyGate';

/*
 * Per-lesson daily-gate guard for /lessons/:lessonId. While the daily-required
 * practice gate is active, a learner may still REVIEW a lesson they have already
 * completed, but a not-yet-completed lesson (partial or not started) is blocked
 * with the banner-only screen. The shared DailyGateRoute can't make this call (it
 * wraps several routes and lacks the lessonId), so the decision happens here using
 * the route param.
 *
 * "Completed" is course-intersected (useDailyGate's completedInCourseIds), so stale
 * ids never matter. Outside the gate — or once today's practice is passed — every
 * lesson renders normally. The flag + fail-safe live in useDailyGate (degrade to
 * rendering the lesson on error/empty/loading progress).
 */
export function LessonGate() {
  const { lessonId } = useParams();
  const { gated, completedInCourseIds } = useDailyGate();

  const lessonCompleted = lessonId != null && completedInCourseIds.has(lessonId);

  if (gated && !lessonCompleted) {
    return <DailyGateBlockedScreen />;
  }

  return <LessonPage />;
}
