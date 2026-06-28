import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CoinIcon, XpIcon } from './CurrencyIcons';

type HeaderStatsProps = {
  /** Spendable coin balance (lifetime coins earned minus coins spent). */
  coins: number;
  /** Lifetime XP earned (the leaderboard metric). */
  xp: number;
  streak: number;
};

const MAX_FLAMES = 3;

/* When the header can't fit every stat chip on a narrow screen, chips drop in
   this order — coins first, then the streak, with XP kept visible the longest. */
export const STAT_HIDE_PRIORITY = ['coins', 'streak', 'xp'] as const;

export type HeaderStatKey = (typeof STAT_HIDE_PRIORITY)[number];

export type StatVisibility = Record<HeaderStatKey, boolean>;

/**
 * Pure mapping from "how many chips fit" to "which chips stay visible". Chips are
 * removed in STAT_HIDE_PRIORITY order (coins → streak → XP), so a smaller
 * `shownCount` always keeps XP the longest. Out-of-range counts are clamped.
 */
export function getStatVisibility(shownCount: number): StatVisibility {
  const total = STAT_HIDE_PRIORITY.length;
  const clamped = Math.max(0, Math.min(total, Math.floor(shownCount)));
  const hidden = new Set<HeaderStatKey>(STAT_HIDE_PRIORITY.slice(0, total - clamped));

  return {
    coins: !hidden.has('coins'),
    streak: !hidden.has('streak'),
    xp: !hidden.has('xp'),
  };
}

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

  const containerRef = useRef<HTMLDivElement>(null);
  /* Bumped on resize so chips can return when space frees up (and re-collapse
     when it's lost); also bumped once web fonts finish loading. */
  const [measureToken, setMeasureToken] = useState(0);
  const [shownCount, setShownCount] = useState<number>(STAT_HIDE_PRIORITY.length);

  /* Watch width via the full-width .site-header bar. Observing that — rather than
     the stats wrapper — means hiding a chip never resizes the observed element,
     so the ResizeObserver can't feed back into a measure/render loop. */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const target = (container.closest('.site-header') as HTMLElement | null) ?? container;
    let cancelled = false;
    const bump = () => {
      if (!cancelled) {
        setMeasureToken((token) => token + 1);
      }
    };

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(bump);
      observer.observe(target);
    }
    window.addEventListener('resize', bump);
    /* A late web-font swap can widen the chips; re-measure once it settles. */
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(bump).catch(() => undefined);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener('resize', bump);
    };
  }, []);

  /* Start every measurement from "show everything" so freed space restores
     chips; the shrink pass below then trims back down to what actually fits. */
  useLayoutEffect(() => {
    setShownCount(STAT_HIDE_PRIORITY.length);
  }, [measureToken, coins, xp, streak]);

  /* After each commit, hide one more chip while the header overflows its width.
     shownCount only decreases here (and is reset above on real layout changes),
     so this settles in at most three steps and can't loop. */
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const target = (container.closest('.site-header') as HTMLElement | null) ?? container;
    const overflowing = target.scrollWidth - target.clientWidth > 1;

    if (overflowing && shownCount > 0) {
      setShownCount(shownCount - 1);
    }
  });

  const visible = getStatVisibility(shownCount);

  return (
    <div className="header-stats" ref={containerRef}>
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

      {visible.coins ? (
        <span className="hs-chip hs-coin" aria-label={`${coins.toLocaleString()} coin balance`}>
          <CoinIcon className="hs-chip-icon hs-coin-icon" />
          <span className="hs-chip-value">{coins.toLocaleString()}</span>
          <span className="hs-chip-unit">coins</span>
        </span>
      ) : null}

      {visible.xp ? (
        <span className="hs-chip hs-xp" aria-label={`${xp.toLocaleString()} XP earned`}>
          <XpIcon className="hs-chip-icon hs-xp-icon" />
          <span className="hs-chip-value">{xp.toLocaleString()}</span>
          <span className="hs-chip-unit">XP</span>
        </span>
      ) : null}

      {visible.streak ? (
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
      ) : null}
    </div>
  );
}
