import { Link, Navigate, useParams } from 'react-router-dom';
import { lessons } from '../data/lessons';
import { isDailyGateActive } from '../lessons/dailyGate';
import { useLessonProgress } from '../lessons/lessonProgress';
import { GameShell } from '../games/GameShell';
import { getGameById } from '../games';
import './GamesPage.css';

/** Route for a single arcade game (`/games/:gameId`); unknown id redirects to the arcade so deep links never dead-end. */
export function GamePlayPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const game = gameId ? getGameById(gameId) : undefined;
  /* Defensive notice for the daily gate (the route guard already redirects). */
  const { progress, testTodayKey } = useLessonProgress(lessons);
  const gated = isDailyGateActive(progress, testTodayKey);

  if (!game) {
    return <Navigate to="/games" replace />;
  }

  return (
    <section className="games-page">
      {gated ? (
        <div className="page-card narrow-card" role="alert">
          <p>
            Finish today&apos;s required practice to keep playing.{' '}
            <Link to="/practice">Go to practice</Link>.
          </p>
        </div>
      ) : null}
      <GameShell game={game} />
    </section>
  );
}
