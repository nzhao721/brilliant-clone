import { Navigate, useParams } from 'react-router-dom';
import { GameShell } from '../games/GameShell';
import { getGameById } from '../games';
import './GamesPage.css';

/** Route for a single arcade game (`/games/:gameId`); unknown id redirects to the arcade so deep links never dead-end. */
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
