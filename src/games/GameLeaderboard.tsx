import { LeaderboardList } from '../components/LeaderboardList';
import { useGameLeaderboard } from './useGameLeaderboard';
import './GameLeaderboard.css';

// ---------------------------------------------------------------------------
// GameLeaderboard — the GLOBAL, real-time cloud high-score board for one game,
// shown on the game-over panel. It reuses the shared <LeaderboardList> (and the
// same ranking as the XP boards) for the signed-in cloud board, and degrades
// gracefully for the signed-out / Firestore-unavailable cases by showing the
// player's LOCAL best plus a short prompt (never crashes, never shows fake
// competitors).
// ---------------------------------------------------------------------------

function bestLine(localBest: number | null): string | null {
  return localBest === null ? null : `Your best on this device: ${localBest.toLocaleString()}.`;
}

export function GameLeaderboard({
  gameId,
  currentScore,
}: {
  gameId: string;
  currentScore?: number;
}) {
  const board = useGameLeaderboard(gameId, currentScore);

  return (
    <section className="game-leaderboard" aria-label="High scores">
      <h3 className="game-leaderboard-title">Global high scores</h3>

      {!board.available ? (
        // Firestore not configured (e.g. local dev without env / tests).
        <p className="game-leaderboard-note">
          The global leaderboard is offline right now.
          {bestLine(board.localBest) ? ` ${bestLine(board.localBest)}` : ''}
        </p>
      ) : !board.signedIn ? (
        <p className="game-leaderboard-note">
          Sign in to compete on the global leaderboard.
          {bestLine(board.localBest) ? ` ${bestLine(board.localBest)}` : ''}
        </p>
      ) : (
        <LeaderboardList
          {...board}
          unit="pts"
          listLabel="Top scores for this game"
          loadingLabel="Loading high scores"
          errorMessage="We couldn't load the global high scores right now. Try again in a moment."
          emptyTitle="No scores yet"
          emptyMessage="Play a round to claim the top spot."
        />
      )}
    </section>
  );
}
