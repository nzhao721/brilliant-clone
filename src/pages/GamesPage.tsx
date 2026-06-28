import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CoinIcon } from '../components/CurrencyIcons';
import { DailyGateBanner } from '../components/DailyGateBanner';
import { lessons } from '../data/lessons';
import { DAILY_GATE_ENABLED, DAILY_GATE_LOCK_LABEL, isDailyGateActive } from '../lessons/dailyGate';
import { useLessonProgress } from '../lessons/lessonProgress';
import { games, readArcadeHighScore, type GameDefinition } from '../games';
import { useCurrency } from '../games/useCurrency';
import './GamesPage.css';

/** Coins needed to begin one session: a full upfront cost, or a single second. */
function gameStartCost(game: GameDefinition): number {
  return game.billing.mode === 'per-second' ? game.billing.coinsPerSecond : game.billing.coinCost;
}

/** Grammatically correct noun for a count: pluralize(1, 'coin') → 'coin'. */
function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/** Combined cost label: per-second → "N coins per second"; fixed → "N coins for M seconds". */
function gameCostLabel(game: GameDefinition): string {
  return game.billing.mode === 'per-second'
    ? `${game.billing.coinsPerSecond} ${pluralize(game.billing.coinsPerSecond, 'coin')} per second`
    : `${game.billing.coinCost} ${pluralize(game.billing.coinCost, 'coin')} for ${game.billing.durationSeconds} ${pluralize(game.billing.durationSeconds, 'second')}`;
}

function ArcadeBalance({ coinBalance }: { coinBalance: number }) {
  return (
    <div className="arcade-balance">
      <div
        className="arcade-balance-item arcade-balance-item-primary"
        role="group"
        aria-label="Your coin balance"
      >
        <span className="arcade-balance-label">
          <CoinIcon className="arcade-balance-ico reward-ico-coin" /> Coin balance
        </span>
        <span className="arcade-balance-value">{coinBalance.toLocaleString()}</span>
        <span className="arcade-balance-hint">Spend coins on game time — earn them in lessons</span>
      </div>
    </div>
  );
}

function GameCard({
  game,
  highScore,
  affordable,
  locked,
  onPlay,
}: {
  game: GameDefinition;
  highScore: number;
  affordable: boolean;
  /** Daily gate active → the play button is GRAYED OUT / disabled with a lock label. */
  locked: boolean;
  onPlay: () => void;
}) {
  const startCost = gameStartCost(game);
  // The gate takes precedence over affordability for both the label and disabling.
  const playLabel = locked
    ? DAILY_GATE_LOCK_LABEL
    : affordable
      ? game.billing.mode === 'per-second'
        ? 'Play'
        : `Play · ${game.billing.coinCost} ${pluralize(game.billing.coinCost, 'coin')}`
      : `Need ${startCost} ${pluralize(startCost, 'coin')}`;
  const disabled = locked || !affordable;

  return (
    <article className={`game-card${disabled ? ' is-locked' : ''}`}>
      <div className="game-card-head">
        <h2 className="game-card-name">{game.name}</h2>
      </div>
      <p className="game-card-desc">{game.description}</p>
      <p className="game-card-cost">
        <CoinIcon className="game-card-cost-ico reward-ico-coin" />
        <span>{gameCostLabel(game)}</span>
      </p>
      <dl className="game-card-meta">
        <div className="game-card-meta-item">
          <dt>Your best</dt>
          <dd>{highScore > 0 ? highScore.toLocaleString() : '—'}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="primary-button game-card-play"
        onClick={onPlay}
        disabled={disabled}
      >
        {playLabel}
      </button>
    </article>
  );
}

export function GamesPage() {
  const { coinBalance } = useCurrency();
  const navigate = useNavigate();
  /* Defensive in-page notice for the daily gate (the route guard already
   * redirects gated learners to /practice before they reach the arcade). Behind
   * DAILY_GATE_ENABLED so the notice never shows while the gate is disabled. */
  const { progress, testTodayKey } = useLessonProgress(lessons);
  const gated = DAILY_GATE_ENABLED && isDailyGateActive(progress, testTodayKey);

  /* High scores read once per mount; returning remounts this page (AppLayout keys the outlet by pathname), so fresh bests show. */
  const highScores = useMemo(() => {
    const scores: Record<string, number> = {};
    for (const game of games) {
      scores[game.id] = readArcadeHighScore(game.id);
    }
    return scores;
  }, []);

  return (
    <section className="games-page">
      <div className="page-heading">
        <h1>Arcade</h1>
        <p>
          Spend the coins you've earned in lessons on a few minutes of play.
          Endless games bill a few coins per second until you lose or run out;
          the quick reflex games charge a set price for a fixed round. Playing
          only spends coins — your lessons and leaderboard standing are untouched.
        </p>
      </div>

      {gated ? <DailyGateBanner /> : null}

      <ArcadeBalance coinBalance={coinBalance} />

      <Link className="race-cta" to="/race">
        <span className="race-cta-copy">
          <span className="race-cta-title">Slipstream</span>
          <span className="race-cta-sub">Answer questions to outrun a friend or a bot — free to play.</span>
        </span>
        <span className="race-cta-go" aria-hidden="true">Race →</span>
      </Link>

      {games.length === 0 ? (
        <div className="page-card narrow-card games-empty">
          <h2 className="games-empty-title">No games yet</h2>
          <p>New arcade games are on the way. Check back soon.</p>
        </div>
      ) : (
        <ul className="games-grid" aria-label="Arcade games">
          {games.map((game) => (
            <li key={game.id} className="games-grid-item">
              <GameCard
                game={game}
                highScore={highScores[game.id] ?? 0}
                affordable={coinBalance >= gameStartCost(game)}
                locked={gated}
                onPlay={() => navigate(`/games/${game.id}`)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
