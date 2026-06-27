// Reaction (id: reaction-trainer): a self-contained React + DOM game. A target
// appears after a random delay — tap it fast for a speed bonus; jumping the gun
// docks points. A TIMED game, so it never calls onGameOver; the shell owns chrome.

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { useGameSound } from './useGameSound';

// Shared game contract, re-declared locally so this file imports nothing shared.
type GameProps = {
  active: boolean;
  onScoreChange: (score: number) => void;
  onGameOver: () => void;
};

type Target = { id: number; xPct: number; yPct: number };

// Timing (ms). The delay before a target appears is randomised so the player
// cannot anticipate it; a target also auto-expires so dawdling costs the streak.
const MIN_DELAY = 450;
const MAX_DELAY = 1500;
const TARGET_LIFETIME = 1400;

// Scoring. Every clean hit is worth BASE_POINTS, plus a speed bonus that decays
// linearly from MAX_SPEED_BONUS (instant) to 0 by SPEED_WINDOW ms. Jumping the
// gun costs MISCLICK_PENALTY (floored at zero).
const BASE_POINTS = 25;
const MAX_SPEED_BONUS = 75;
const SPEED_WINDOW = 900;
const MISCLICK_PENALTY = 20;

// Keep the whole target inside the box (values are % of the play area).
const SPAWN_INSET_X = 12;
const SPAWN_INSET_Y = 14;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

const STYLE_TAG = `
.rt-area:focus-visible { outline: 3px solid color-mix(in srgb, var(--brand) 55%, transparent); outline-offset: 3px; }
.rt-target:active { transform: translate(-50%, -50%) scale(0.92); }
@keyframes rt-pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.45; }
  50% { transform: translate(-50%, -50%) scale(1.15); opacity: 0.85; }
}
@media (prefers-reduced-motion: reduce) { .rt-reticle { animation: none !important; } }
`;

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
  width: '100%',
};

const areaStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 480,
  aspectRatio: '4 / 3',
  margin: '0 auto',
  borderRadius: 18,
  border: '1px solid var(--line-strong)',
  background: 'radial-gradient(120% 120% at 50% 0%, var(--surface), var(--brand-tint))',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.6)',
  overflow: 'hidden',
  cursor: 'crosshair',
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
};

const targetBaseStyle: CSSProperties = {
  position: 'absolute',
  width: 62,
  height: 62,
  margin: 0,
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  transform: 'translate(-50%, -50%)',
  cursor: 'pointer',
  display: 'grid',
  placeItems: 'center',
  background:
    'radial-gradient(circle at 38% 30%, var(--brand-bright), var(--brand) 58%, var(--brand-strong))',
  boxShadow: '0 10px 20px rgba(11, 94, 63, 0.35), inset 0 0 0 4px rgba(255, 255, 255, 0.9)',
  touchAction: 'none',
  WebkitTapHighlightColor: 'transparent',
};

const targetCoreStyle: CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: '50%',
  background: 'var(--accent)',
  boxShadow: '0 0 0 4px rgba(255, 255, 255, 0.85)',
};

const reticleStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: 54,
  height: 54,
  borderRadius: '50%',
  border: '3px dashed var(--ink-faint)',
  transform: 'translate(-50%, -50%)',
  animation: 'rt-pulse 1.1s ease-in-out infinite',
  pointerEvents: 'none',
};

const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  textAlign: 'center',
  color: 'var(--ink-soft)',
  fontWeight: 600,
  pointerEvents: 'none',
};

const waitTextStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 16,
  transform: 'translateX(-50%)',
  margin: 0,
  color: 'var(--ink-soft)',
  fontSize: '0.85rem',
  fontWeight: 600,
  letterSpacing: '0.02em',
  pointerEvents: 'none',
};

const captionRowStyle: CSSProperties = {
  display: 'flex',
  gap: 18,
  justifyContent: 'center',
  alignItems: 'center',
  color: 'var(--ink-soft)',
  fontSize: '0.85rem',
  fontWeight: 600,
};

const captionValueStyle: CSSProperties = {
  color: 'var(--brand-strong)',
  fontWeight: 800,
  fontVariantNumeric: 'tabular-nums',
};

const srOnlyStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export function ReactionTrainer({ active, onScoreChange }: GameProps): ReactNode {
  // Stable handle, safe to call from the timers/handlers below.
  const sound = useGameSound(active, 'pulse');

  const [score, setScore] = useState(0);
  const [target, setTarget] = useState<Target | null>(null);
  const [streak, setStreak] = useState(0);
  const [lastReaction, setLastReaction] = useState<number | null>(null);

  const appearTimerRef = useRef<number | null>(null);
  const expireTimerRef = useRef<number | null>(null);
  const appearedAtRef = useRef(0);
  const targetIdRef = useRef(0);
  const targetRef = useRef<Target | null>(null);
  const activeRef = useRef(false);
  // Mirrors `streak` for timer/handler logic (milestone fanfare) without making
  // the stable callbacks depend on the streak state.
  const streakRef = useRef(0);
  // Tracks whether a real session has begun, so the game-over sting fires on a
  // genuine stop and never on the initial inactive mount.
  const startedRef = useRef(false);
  const scheduleAppearRef = useRef<() => void>(() => {});
  const areaRef = useRef<HTMLDivElement | null>(null);
  const onScoreChangeRef = useRef(onScoreChange);

  // Always call the latest score reporter from inside timers/handlers.
  useEffect(() => {
    onScoreChangeRef.current = onScoreChange;
  });

  // Report the running score live, but only while a session is active so the
  // shell keeps the final number frozen after time runs out.
  useEffect(() => {
    if (active) {
      onScoreChangeRef.current(score);
    }
  }, [active, score]);

  const clearTimers = useCallback(() => {
    if (appearTimerRef.current !== null) {
      window.clearTimeout(appearTimerRef.current);
      appearTimerRef.current = null;
    }
    if (expireTimerRef.current !== null) {
      window.clearTimeout(expireTimerRef.current);
      expireTimerRef.current = null;
    }
  }, []);

  const spawnTarget = useCallback(() => {
    if (!activeRef.current) {
      return;
    }
    appearTimerRef.current = null;
    const next: Target = {
      id: (targetIdRef.current += 1),
      xPct: randomBetween(SPAWN_INSET_X, 100 - SPAWN_INSET_X),
      yPct: randomBetween(SPAWN_INSET_Y, 100 - SPAWN_INSET_Y),
    };
    targetRef.current = next;
    appearedAtRef.current = performance.now();
    setTarget(next);

    // Auto-expire: a target left untapped vanishes, breaks the streak, and the
    // next one schedules itself.
    expireTimerRef.current = window.setTimeout(() => {
      expireTimerRef.current = null;
      if (!activeRef.current) {
        return;
      }
      // Let it slip away: a harsh "missed it" impact and the streak resets.
      sound.playEffect('crash');
      targetRef.current = null;
      setTarget(null);
      streakRef.current = 0;
      setStreak(0);
      setLastReaction(null);
      scheduleAppearRef.current();
    }, TARGET_LIFETIME);
  }, [sound]);

  const scheduleAppear = useCallback(() => {
    if (!activeRef.current) {
      return;
    }
    clearTimers();
    appearTimerRef.current = window.setTimeout(spawnTarget, randomBetween(MIN_DELAY, MAX_DELAY));
  }, [clearTimers, spawnTarget]);

  useEffect(() => {
    scheduleAppearRef.current = scheduleAppear;
  }, [scheduleAppear]);

  const registerHit = useCallback(() => {
    if (!activeRef.current || !targetRef.current) {
      return;
    }
    if (expireTimerRef.current !== null) {
      window.clearTimeout(expireTimerRef.current);
      expireTimerRef.current = null;
    }
    const reaction = Math.max(0, performance.now() - appearedAtRef.current);
    const bonus = Math.max(0, Math.round(MAX_SPEED_BONUS * (1 - reaction / SPEED_WINDOW)));
    const gained = BASE_POINTS + bonus;
    const nextStreak = streakRef.current + 1;
    streakRef.current = nextStreak;

    targetRef.current = null;
    setTarget(null);
    setLastReaction(Math.round(reaction));
    setStreak(nextStreak);
    setScore((prev) => prev + gained);
    // A crisp "point" on every clean hit; every 5th in a row swaps in the longer
    // "win" fanfare instead, so a streak audibly builds to a payoff.
    sound.playEffect(nextStreak % 5 === 0 ? 'win' : 'point');
    scheduleAppearRef.current();
  }, [sound]);

  const registerMiss = useCallback(() => {
    if (!activeRef.current) {
      return;
    }
    // Jumped the gun (empty-space click / early key): a gentle "nope" + penalty.
    sound.playEffect('incorrect');
    streakRef.current = 0;
    setStreak(0);
    setScore((prev) => Math.max(0, prev - MISCLICK_PENALTY));
  }, [sound]);

  // Lifecycle: start fresh when active turns true, stop + clean up otherwise.
  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      clearTimers();
      targetRef.current = null;
      setTarget(null);
      setScore(0);
      streakRef.current = 0;
      setStreak(0);
      setLastReaction(null);
      // Sting only on a genuine session end, not the initial inactive mount.
      if (startedRef.current) {
        startedRef.current = false;
        sound.playEffect('gameOver');
      }
      return;
    }

    targetIdRef.current = 0;
    targetRef.current = null;
    appearedAtRef.current = 0;
    setTarget(null);
    setScore(0);
    streakRef.current = 0;
    setStreak(0);
    setLastReaction(null);
    startedRef.current = true;
    sound.playEffect('gameStart');
    areaRef.current?.focus({ preventScroll: true });
    scheduleAppear();

    return () => {
      clearTimers();
    };
  }, [active, clearTimers, scheduleAppear, sound]);

  // Countdown ticks while waiting for the next target. Active only between rounds
  // (session running, no target on screen), mirroring the pulsing "Wait for it…"
  // reticle and building anticipation under the tense backing track.
  useEffect(() => {
    if (!active || target) {
      return undefined;
    }
    const ticker = window.setInterval(() => {
      sound.playEffect('tick');
    }, 350);
    return () => {
      window.clearInterval(ticker);
    };
  }, [active, target, sound]);

  const handleAreaPointerDown = useCallback(() => {
    // A press that reaches the play area means the target itself was not hit
    // (its handler stops propagation): treat it as jumping the gun.
    if (activeRef.current) {
      registerMiss();
    }
  }, [registerMiss]);

  const handleTargetPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      registerHit();
    },
    [registerHit],
  );

  // Striking is bound at the window level (like the other arcade games) so Space
  // or Enter works the instant a round starts, without first clicking the play
  // area. Bound only while active; torn down on deactivate/unmount.
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      const isStrike = key === ' ' || key === 'Spacebar' || key === 'Enter';
      if (
        isStrike ||
        key === 'ArrowUp' ||
        key === 'ArrowDown' ||
        key === 'ArrowLeft' ||
        key === 'ArrowRight'
      ) {
        event.preventDefault();
      }
      if (!isStrike) {
        return;
      }
      if (targetRef.current) {
        registerHit();
      } else {
        registerMiss();
      }
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, registerHit, registerMiss]);

  let content: ReactNode;
  if (!active) {
    content = (
      <div style={overlayStyle}>
        <p style={{ margin: 0, maxWidth: 280 }}>
          A target pops up at random &mdash; tap it the instant it appears.
        </p>
      </div>
    );
  } else if (target) {
    content = (
      <button
        type="button"
        className="rt-target"
        aria-label="Target — tap now"
        onPointerDown={handleTargetPointerDown}
        style={{ ...targetBaseStyle, left: `${target.xPct}%`, top: `${target.yPct}%` }}
      >
        <span aria-hidden="true" style={targetCoreStyle} />
      </button>
    );
  } else {
    content = (
      <>
        <div className="rt-reticle" aria-hidden="true" style={reticleStyle} />
        <p style={waitTextStyle}>Wait for it&hellip;</p>
      </>
    );
  }

  return (
    <div style={wrapStyle}>
      <style>{STYLE_TAG}</style>
      <div
        ref={areaRef}
        className="rt-area"
        role="application"
        aria-label="Reaction trainer. A target appears after a short delay — tap it as fast as you can, or press space or enter to strike while one is showing."
        tabIndex={0}
        onPointerDown={handleAreaPointerDown}
        style={areaStyle}
      >
        {content}
      </div>

      <div style={captionRowStyle}>
        <span>
          Last:{' '}
          <span style={captionValueStyle}>
            {lastReaction === null ? '—' : `${lastReaction} ms`}
          </span>
        </span>
        <span>
          Streak: <span style={captionValueStyle}>{streak}</span>
        </span>
      </div>

      <span style={srOnlyStyle} aria-live="polite">
        {active && lastReaction !== null ? `Hit in ${lastReaction} milliseconds` : ''}
      </span>
    </div>
  );
}
