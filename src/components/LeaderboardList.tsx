import type { ReactNode } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import type { RankedLeaderboardEntry, UseLeaderboardResult } from '../leaderboard/useLeaderboard';
import './LeaderboardList.css';

/*
 * Presentational ranked board for the global and per-class leaderboards: renders
 * loading/error/empty/ranked states, highlights the current user, and pins them
 * below the list when out of view.
 */

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return name.trim().slice(0, 2).toUpperCase() || '?';
}

function LeaderboardRow({ entry, unit }: { entry: RankedLeaderboardEntry; unit: string }) {
  const medalClass = entry.rank <= 3 ? ` leaderboard-row-rank-${entry.rank}` : '';

  return (
    <li
      className={`leaderboard-row${entry.isCurrentUser ? ' is-current-user' : ''}${medalClass}`}
      aria-current={entry.isCurrentUser ? 'true' : undefined}
    >
      <span className="leaderboard-rank">
        <span className="sr-only">Rank </span>
        {entry.rank}
      </span>
      <span className="leaderboard-avatar" aria-hidden="true">
        {getInitials(entry.displayName)}
      </span>
      <span className="leaderboard-name">
        <span className="leaderboard-name-text">{entry.displayName}</span>
        {entry.isCurrentUser ? <span className="leaderboard-you-badge">You</span> : null}
      </span>
      <span className="leaderboard-xp">
        <span className="leaderboard-xp-value">{entry.xp.toLocaleString()}</span>
        {unit ? <span className="leaderboard-xp-unit"> {unit}</span> : null}
      </span>
    </li>
  );
}

function LeaderboardStatusCard({ children }: { children: ReactNode }) {
  return <div className="page-card narrow-card leaderboard-message">{children}</div>;
}

export type LeaderboardListProps = UseLeaderboardResult & {
  /** Accessible label for the ranked list (e.g. "Top 10 learners ranked by XP"). */
  listLabel: string;
  /** Unit suffix shown after each value (e.g. "XP" or "pts"). Empty hides it. */
  unit?: string;
  loadingLabel?: string;
  errorMessage?: string;
  emptyTitle?: string;
  emptyMessage?: string;
};

export function LeaderboardList({
  status,
  entries,
  currentUserRank,
  currentUserOutsideTop,
  listLabel,
  unit = 'XP',
  loadingLabel = 'Loading leaderboard',
  errorMessage = "We couldn't load the leaderboard right now. Try again in a moment.",
  emptyTitle = 'No scores yet',
  emptyMessage = 'Be the first to earn XP: finish a lesson or nail some practice to claim the top spot.',
}: LeaderboardListProps) {
  if (status === 'loading') {
    return (
      <div className="page-card narrow-card loading-state" aria-live="polite">
        <LoadingSpinner label={loadingLabel} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <LeaderboardStatusCard>
        <p className="error-message" role="alert">
          {errorMessage}
        </p>
      </LeaderboardStatusCard>
    );
  }

  if (entries.length === 0) {
    return (
      <LeaderboardStatusCard>
        <h2 className="leaderboard-message-title">{emptyTitle}</h2>
        <p>{emptyMessage}</p>
      </LeaderboardStatusCard>
    );
  }

  const ownEntry = entries.find((entry) => entry.isCurrentUser) ?? currentUserOutsideTop ?? null;

  return (
    <>
      {ownEntry ? (
        <div className="leaderboard-self" aria-live="polite">
          <span className="leaderboard-self-label">Your standing</span>
          <span className="leaderboard-self-value">
            {currentUserRank ? (
              <>
                Rank <strong>#{currentUserRank}</strong> ·{' '}
              </>
            ) : null}
            <strong>{ownEntry.xp.toLocaleString()}</strong>
            {unit ? ` ${unit}` : ''}
          </span>
        </div>
      ) : null}

      <ol className="leaderboard-list" aria-label={listLabel}>
        {entries.map((entry) => (
          <LeaderboardRow key={entry.id} entry={entry} unit={unit} />
        ))}
      </ol>

      {currentUserOutsideTop ? (
        <>
          <div
            className="leaderboard-gap"
            role="separator"
            aria-label="Your position below the top ranks"
          >
            <span className="leaderboard-gap-dots" aria-hidden="true">
              •••
            </span>
          </div>
          <ol
            className="leaderboard-list leaderboard-list-own"
            start={currentUserOutsideTop.rank}
            aria-label="Your position"
          >
            <LeaderboardRow entry={currentUserOutsideTop} unit={unit} />
          </ol>
        </>
      ) : null}
    </>
  );
}
