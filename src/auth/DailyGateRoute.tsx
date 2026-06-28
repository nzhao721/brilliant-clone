import { Outlet } from 'react-router-dom';
import { DailyGateBlockedScreen } from '../components/DailyGateBlockedScreen';
import { useDailyGate } from './useDailyGate';

/*
 * Enforces the DAILY-REQUIRED mixed-practice gate for the FULLY-blocked routes —
 * the arcade game-play page (games/:gameId) and a direct link into an ACTIVE race
 * match (race/:matchId). These are not "reviewable", so while the gate is active a
 * direct URL renders the banner-only blocked screen (the shared DailyGateBanner,
 * whose CTA points at /practice) IN PLACE of the route, instead of redirecting.
 * `/practice` itself sits OUTSIDE this guard so it is always reachable.
 *
 * Lessons are gated PER-LESSON by LessonGate (completed lessons stay reviewable),
 * so they are intentionally NOT wrapped here. The flag + fail-safe live in
 * useDailyGate: it only reports `gated` when it can confirm a passable gate, and
 * degrades to ungated (render <Outlet/>) on error/empty/loading progress.
 */
export function DailyGateRoute() {
  const { gated } = useDailyGate();

  if (gated) {
    return <DailyGateBlockedScreen />;
  }

  return <Outlet />;
}
