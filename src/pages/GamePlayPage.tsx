import { Navigate, useParams } from 'react-router-dom';
import { GameShell } from '../games/GameShell';
import { getGameById } from '../games';
import './GamesPage.css';

/**
 * Full-page route for a single arcade game (`/games/:gameId`). Looks the game up
 * in the registry and hands it to the shared {@link GameShell} harness. An
 * unknown id redirects back to the arcade homepage — the same graceful-redirect
 * convention the app uses for other invalid routes — so deep links never dead-end.
 */
export function GamePlayPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const game = gameId ? getGameById(gameId) : undefined;

  if (!game) {
    return <Navigate to="/games" replace />;
  }

  return (
    <section className="games-page">
      <GameShell game={game} />
    </section>
  );
}
