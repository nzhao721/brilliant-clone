import { DailyGateBanner } from './DailyGateBanner';
import './DailyGateBlockedScreen.css';

/**
 * The banner-only "blocked" screen rendered in place of a gated route's content
 * while the daily-required practice gate is active. Its ONLY content is the shared
 * DailyGateBanner, centered in the routed page body — no lesson/game content. The
 * banner's "Start required practice" CTA still funnels the learner to /practice, so
 * a direct URL to a blocked route SHOWS the gate instead of silently redirecting.
 *
 * Used by the route guards: DailyGateRoute (games/race) and LessonGate (a lesson
 * the learner has not yet completed). It renders inside the existing AppLayout shell.
 */
export function DailyGateBlockedScreen() {
  return (
    <section className="daily-gate-blocked">
      <DailyGateBanner />
    </section>
  );
}
