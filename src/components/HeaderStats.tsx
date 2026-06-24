type HeaderStatsProps = {
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
 * Always-on progress HUD for the header (signed-in only): a gold XP chip plus a
 * streak shown as up to three fire icons that light up — one per day, capped at
 * three. The numeric streak still reads out via the group's accessible label.
 */
export function HeaderStats({ xp, streak }: HeaderStatsProps) {
  const litFlames = Math.min(Math.max(streak, 0), MAX_FLAMES);
  const label = streakLabel(streak);

  return (
    <div className="header-stats">
      {/* Shared gradient defs, referenced by the icons below. */}
      <svg className="hs-defs" aria-hidden="true" focusable="false" width="0" height="0">
        <defs>
          <linearGradient id="hs-xp-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd25a" />
            <stop offset="1" stopColor="#f5a623" />
          </linearGradient>
          <linearGradient id="hs-fire-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffb02e" />
            <stop offset="0.55" stopColor="#ff6a3d" />
            <stop offset="1" stopColor="#ff3d3d" />
          </linearGradient>
        </defs>
      </svg>

      <span className="hs-xp" aria-label={`${xp.toLocaleString()} XP earned`}>
        <svg className="hs-xp-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill="url(#hs-xp-grad)"
            d="M12 2.5 14.2 8.9 21 9.1 15.6 13.2 17.6 19.7 12 15.8 6.4 19.7 8.4 13.2 3 9.1 9.8 8.9Z"
          />
        </svg>
        <span className="hs-xp-value">{xp.toLocaleString()}</span>
        <span className="hs-xp-unit">XP</span>
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
