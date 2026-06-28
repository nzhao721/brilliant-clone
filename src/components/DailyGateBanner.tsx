import { Link } from 'react-router-dom';
import './DailyGateBanner.css';

/**
 * Shared "Daily practice required" banner shown atop EVERY page that still renders
 * while the daily-required practice gate is active — the dashboard, the arcade
 * (GamesPage), and the Slipstream race home (RacePage). A cream/beige rounded card
 * with a bold heading, gray explanatory copy, and a green pill CTA into the
 * required set at /practice, so all three pages are identical.
 *
 * Callers decide WHEN to show it (each gates on DAILY_GATE_ENABLED &&
 * isDailyGateActive); this component only owns the consistent look + copy.
 */
export function DailyGateBanner() {
  return (
    <div className="daily-gate-banner" role="alert">
      <div className="daily-gate-banner-body">
        <h2 className="daily-gate-banner-title">Daily practice required</h2>
        <p className="daily-gate-banner-copy">
          Pass today&apos;s mixed practice with 85% or better to unlock your lessons,
          games, and the rest of SlopeWise for the day.
        </p>
      </div>
      <Link className="primary-button daily-gate-banner-action" to="/practice">
        Start required practice
      </Link>
    </div>
  );
}
