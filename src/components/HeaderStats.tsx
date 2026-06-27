import { CoinIcon, XpIcon } from './CurrencyIcons';

type HeaderStatsProps = {
  /** Spendable coin balance (lifetime coins earned minus coins spent). */
  coins: number;
  /** Lifetime XP earned (the leaderboard metric). */
  xp: number;
  streak: number;
};

const MAX_FLAMES = 3;

function streakLabel(streak: number) {
  if (streak <= 0) {
    return 'No active streak yet';
  }

  return streak === 1 ? '1 day streak' : `${streak} day streak`;
}

/**
 * Header progress HUD (signed-in only): coin chip, XP chip, and a streak of up to
 * three fire icons. Values read out via each chip's accessible label.
 */
export function HeaderStats({ coins, xp, streak }: HeaderStatsProps) {
  const litFlames = Math.min(Math.max(streak, 0), MAX_FLAMES);
  const label = streakLabel(streak);

  return (
    <div className="header-stats">
      {/* Shared gradient defs for the streak flames below. */}
      <svg className="hs-defs" aria-hidden="true" focusable="false" width="0" height="0">
        <defs>
          <linearGradient id="hs-fire-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffb02e" />
            <stop offset="0.55" stopColor="#ff6a3d" />
            <stop offset="1" stopColor="#ff3d3d" />
          </linearGradient>
        </defs>
      </svg>

      <span className="hs-chip hs-coin" aria-label={`${coins.toLocaleString()} coin balance`}>
        <CoinIcon className="hs-chip-icon hs-coin-icon" />
        <span className="hs-chip-value">{coins.toLocaleString()}</span>
        <span className="hs-chip-unit">coins</span>
      </span>

      <span className="hs-chip hs-xp" aria-label={`${xp.toLocaleString()} XP earned`}>
        <XpIcon className="hs-chip-icon hs-xp-icon" />
        <span className="hs-chip-value">{xp.toLocaleString()}</span>
        <span className="hs-chip-unit">XP</span>
      </span>

      <span className="hs-streak" role="img" aria-label={label} title={label}>
        {Array.from({ length: MAX_FLAMES }, (_, index) => {
          const lit = index < litFlames;

          return (
            <svg
              key={index}
              className={lit ? 'hs-flame is-lit' : 'hs-flame'}
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                fill={lit ? 'url(#hs-fire-grad)' : '#d8d2c4'}
                d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
              />
            </svg>
          );
        })}
      </span>
    </div>
  );
}
