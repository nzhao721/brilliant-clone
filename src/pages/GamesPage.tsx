import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CoinIcon } from '../components/CurrencyIcons';
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

/**
 * Combined cost label by billing mode: per-second → "N coins per second"; fixed →
 * "N coins for M seconds". One phrase carries both the price and the session length.
 */
function gameCostLabel(game: GameDefinition): string {
  return game.billing.mode === 'per-second'
    ? `${game.billing.coinsPerSecond} ${pluralize(game.billing.coinsPerSecond, 'coin')} per second`
    : `${game.billing.coinCost} ${pluralize(game.billing.coinCost, 'coin')} for ${game.billing.durationSeconds} ${pluralize(game.billing.durationSeconds, 'second')}`;
}

// The spendable coin balance banner atop the arcade.
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
  onPlay,
}: {
  game: GameDefinition;
  highScore: number;
  affordable: boolean;
  onPlay: () => void;
}) {
  const startCost = gameStartCost(game);
  const playLabel = affordable
    ? game.billing.mode === 'per-second'
      ? 'Play'
      : `Play · ${game.billing.coinCost} ${pluralize(game.billing.coinCost, 'coin')}`
    : `Need ${startCost} ${pluralize(startCost, 'coin')}`;

  return (
    <article className={`game-card${affordable ? '' : ' is-locked'}`}>
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
        disabled={!affordable}
      >
        {playLabel}
      </button>
    </article>
  );
}

export function GamesPage() {
  const { coinBalance } = useCurrency();
  const navigate = useNavigate();

  // High scores read once per mount; returning from a game remounts this page
  // (AppLayout keys the outlet by pathname), so fresh bests are picked up.
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
                onPlay={() => navigate(`/games/${game.id}`)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
