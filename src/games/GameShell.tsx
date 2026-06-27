import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSound } from '../audio/SoundProvider';
import { useAuth } from '../auth/AuthContext';
import { CoinIcon } from '../components/CurrencyIcons';
import { db } from '../lib/firebase';
import { resolveLeaderboardDisplayName } from '../leaderboard/leaderboardData';
import {
  readArcadeHighScore,
  saveArcadeHighScore,
  type GameDefinition,
} from './index';
import { GameLeaderboard } from './GameLeaderboard';
import { recordGameScore, recordLocalGameBest } from './gameScores';
import { useCurrency } from './useCurrency';

type ShellPhase = 'idle' | 'playing' | 'over';
// 'time'  → fixed-duration countdown reached 0
// 'gameover' → the game reported a loss
// 'coins' → per-second balance can no longer afford the next second
type EndReason = 'time' | 'gameover' | 'coins';

function formatTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Grammatically correct noun for a count: pluralize(1, 'coin') → 'coin'. */
function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

// Browser keys that scroll the page. While playing we cancel their default so a
// Space/arrow/Page press drives the game instead of moving the viewport. Real
// text fields and Space-activation of buttons/links are left alone, and the
// guard is only armed during play (see the effect below).
const PAGE_SCROLL_KEYS = new Set([
  ' ',
  'Spacebar',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
]);

function scrollKeyShouldBeCancelled(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  if (!PAGE_SCROLL_KEYS.has(event.key)) {
    return false;
  }
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName;
  // Never hijack typing or caret movement in a real input surface.
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
    return false;
  }
  // Space (and the legacy Spacebar) still has to activate a focused button/link.
  if ((event.key === ' ' || event.key === 'Spacebar') && (tag === 'BUTTON' || tag === 'A')) {
    return false;
  }
  return true;
}

/**
 * The shared play harness, billing coins per the game's {@link GameDefinition}:
 *  • per-second — needs one second's coins to start, then deducts `coinsPerSecond`
 *    each second; ends on game over or when the balance can't afford the next.
 *  • fixed — an upfront `coinCost` buys one `durationSeconds` countdown; ends at
 *    0 or on game over.
 * The game owns no chrome: it plays while `active`, reports score, and signals
 * game over. All timers stop on unmount.
 */
export function GameShell({ game }: { game: GameDefinition }) {
  const { coinBalance, spendCoins } = useCurrency();
  const { user } = useAuth();
  // Generic arcade cues shared by every game (individual games own their own
  // in-game sounds via the same useSound API). No-op in jsdom, so tests pass.
  const { playEffect } = useSound();
  const billing = game.billing;
  const isPerSecond = billing.mode === 'per-second';

  const [phase, setPhase] = useState<ShellPhase>('idle');
  const [score, setScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  // Fixed games count a countdown DOWN; per-second games count elapsed time UP.
  const [timeLeft, setTimeLeft] = useState(billing.mode === 'fixed' ? billing.durationSeconds : 0);
  const [elapsed, setElapsed] = useState(0);
  const [highScore, setHighScore] = useState(() => readArcadeHighScore(game.id));
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [endReason, setEndReason] = useState<EndReason>(isPerSecond ? 'gameover' : 'time');
  // Bumped on each Play so the game component remounts fresh between sessions.
  const [runCount, setRunCount] = useState(0);

  // Latest reported score, read at session end without waiting for a re-render.
  const scoreRef = useRef(0);
  // Mirrors `phase` for synchronous guards (so the timer/charge tick and
  // onGameOver can't both end the same session in one tick).
  const phaseRef = useRef<ShellPhase>(phase);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  // The out-of-coins game-over CTA is a router link, not a button.
  const keepLearningRef = useRef<HTMLAnchorElement>(null);
  // The "back to arcade" control is a router link; focused on mount so keyboard
  // and screen-reader users land in the new full-page game context.
  const backLinkRef = useRef<HTMLAnchorElement>(null);
  // Coins billed so far this per-second run (drives the elapsed readout). In a
  // ref so it survives charge-effect re-runs (e.g. a changing `spendCoins`).
  const coinsBilledRef = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // On mount (each game route) move focus to the back-to-arcade control so the
  // new full-page game context is announced and reachable by keyboard.
  useEffect(() => {
    backLinkRef.current?.focus();
  }, []);

  // Affordability is "can I pay to start one more session?": the full upfront
  // cost for fixed games, or a single second for per-second games.
  const startCost = isPerSecond ? billing.coinsPerSecond : billing.coinCost;
  const canAfford = coinBalance >= startCost;
  const Component = game.Component;

  const endSession = useCallback(
    (reason: EndReason) => {
      if (phaseRef.current !== 'playing') {
        return;
      }

      // Guard immediately so a same-tick second caller (e.g. onGameOver firing
      // right as the charge tick fails) is ignored.
      phaseRef.current = 'over';

      const achievedScore = scoreRef.current;
      const previousBest = readArcadeHighScore(game.id);
      const bestScore = saveArcadeHighScore(game.id, achievedScore);

      // Record the finished run once (the phaseRef guard fires endSession once
      // per session): always a LOCAL device best, plus a best-effort GLOBAL cloud
      // mirror when signed in — a leaderboard write must never disrupt this flow.
      recordLocalGameBest(game.id, achievedScore);
      if (db && user) {
        void recordGameScore(db, game.id, {
          uid: user.uid,
          displayName: resolveLeaderboardDisplayName(user),
          score: achievedScore,
        }).catch(() => {
          // Ignore: the local best is saved; the next run self-heals the row.
        });
      }

      setFinalScore(achievedScore);
      setEndReason(reason);
      setHighScore(bestScore);
      setIsNewRecord(achievedScore > 0 && achievedScore > previousBest);
      setPhase('over');
      // Shared end-of-run cue (covers loss, time-up, and out-of-coins).
      playEffect('gameOver');
    },
    [game.id, playEffect, user],
  );

  const handleScoreChange = useCallback((nextScore: number) => {
    const safeScore = Number.isFinite(nextScore) ? Math.floor(nextScore) : 0;
    scoreRef.current = safeScore;
    setScore(safeScore);
  }, []);

  const handleGameOver = useCallback(() => {
    endSession('gameover');
  }, [endSession]);

  const startSession = useCallback(() => {
    if (phaseRef.current === 'playing') {
      return;
    }

    // A start from the game-over screen is a restart; cue a click for it.
    const isRestart = phaseRef.current === 'over';

    if (billing.mode === 'fixed') {
      // Charge the whole session upfront; the button is also disabled when
      // unaffordable, but re-check so the timer never starts without a charge.
      if (!spendCoins(billing.coinCost)) {
        return;
      }
      setTimeLeft(billing.durationSeconds);
    } else {
      // Per-second: don't charge upfront — just require one second's worth so
      // play can begin. Coins are then billed one at a time as play continues.
      if (coinBalance < billing.coinsPerSecond) {
        return;
      }
      coinsBilledRef.current = 0;
      setElapsed(0);
    }

    scoreRef.current = 0;
    setScore(0);
    setFinalScore(0);
    setIsNewRecord(false);
    setRunCount((count) => count + 1);
    phaseRef.current = 'playing';
    setPhase('playing');
    if (isRestart) {
      playEffect('click');
    }
    playEffect('gameStart');
  }, [billing, coinBalance, spendCoins, playEffect]);

  // Fixed games: per-second countdown scoped to the active session.
  useEffect(() => {
    if (phase !== 'playing' || billing.mode !== 'fixed') {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setTimeLeft((remaining) => (remaining > 1 ? remaining - 1 : 0));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [phase, billing.mode]);

  // Fixed games: end the moment the countdown reaches zero.
  useEffect(() => {
    if (phase === 'playing' && billing.mode === 'fixed' && timeLeft === 0) {
      endSession('time');
    }
  }, [phase, timeLeft, billing.mode, endSession]);

  // Per-second games: deduct ONE coin every 1000/coinsPerSecond ms, so the spend
  // is still coinsPerSecond/sec but the balance ticks down a coin at a time. When
  // a tick can't be paid the session ends (out of coins).
  useEffect(() => {
    if (phase !== 'playing' || billing.mode !== 'per-second') {
      return undefined;
    }

    const coinsPerSecond = billing.coinsPerSecond;
    const intervalId = window.setInterval(() => {
      if (!spendCoins(1)) {
        endSession('coins');
        return;
      }

      coinsBilledRef.current += 1;
      // Elapsed play time in whole seconds = coins billed / coins-per-second.
      setElapsed(Math.floor(coinsBilledRef.current / coinsPerSecond));
    }, 1000 / coinsPerSecond);

    return () => window.clearInterval(intervalId);
  }, [phase, billing.mode, billing, spendCoins, endSession]);

  // Move focus to the primary action when a session ends so keyboard players can
  // immediately replay. preventScroll keeps the result panel from yanking the
  // viewport as focus lands on the (off-screen) button.
  useEffect(() => {
    if (phase === 'over') {
      (keepLearningRef.current ?? playButtonRef.current)?.focus({ preventScroll: true });
    }
  }, [phase]);

  // Keep game-control keys from scrolling the page mid-session. Centralised here
  // so it covers every game (even ones whose key handling is element-scoped and
  // stops once focus drifts off the canvas). Only armed while playing.
  useEffect(() => {
    if (phase !== 'playing') {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (scrollKeyShouldBeCancelled(event)) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase]);

  const timeDisplay =
    billing.mode === 'fixed'
      ? phase === 'idle'
        ? formatTime(billing.durationSeconds)
        : formatTime(timeLeft)
      : formatTime(elapsed);
  const timeLabel = isPerSecond ? 'Elapsed' : 'Time';
  const scoreDisplay = phase === 'over' ? finalScore : score;
  const isLowTime = billing.mode === 'fixed' && phase === 'playing' && timeLeft <= 5;
  // Flag a per-second balance that's within ~5 seconds of running dry.
  const isLowCoins =
    isPerSecond && phase === 'playing' && coinBalance < billing.coinsPerSecond * 5;

  // One combined phrase: per-second → "N coins per second"; fixed → "N coins for
  // M seconds".
  const costSummary = isPerSecond
    ? `${billing.coinsPerSecond} ${pluralize(billing.coinsPerSecond, 'coin')} per second`
    : `${billing.coinCost} ${pluralize(billing.coinCost, 'coin')} for ${billing.durationSeconds} ${pluralize(billing.durationSeconds, 'second')}`;
  const playLabel = canAfford
    ? isPerSecond
      ? 'Play'
      : `Play · ${billing.coinCost} ${pluralize(billing.coinCost, 'coin')}`
    : `Need ${startCost} ${pluralize(startCost, 'coin')}`;
  const playAgainLabel = canAfford
    ? isPerSecond
      ? 'Play again'
      : `Play again · ${billing.coinCost} ${pluralize(billing.coinCost, 'coin')}`
    : `Need ${startCost} ${pluralize(startCost, 'coin')}`;

  const resultEyebrow =
    endReason === 'gameover' ? 'Game over' : endReason === 'coins' ? 'Out of coins' : "Time's up";

  return (
    <div className="games-play">
      <Link ref={backLinkRef} className="secondary-button games-back" to="/games">
        <span aria-hidden="true">←</span> Back to arcade
      </Link>
      <section className="game-shell" aria-label={`${game.name} game`}>
        <header className="game-shell-bar">
          <div className="game-shell-identity">
            <h2 className="game-shell-name">{game.name}</h2>
            <p className="game-shell-desc">{game.description}</p>
          </div>
          <div className="game-shell-hud">
            {isPerSecond ? (
              <div className="game-shell-stat">
                <span className="game-shell-stat-label">Coins</span>
                <span className={`game-shell-stat-value${isLowCoins ? ' is-low' : ''}`}>
                  {coinBalance.toLocaleString()}
                </span>
              </div>
            ) : null}
            <div className="game-shell-stat">
              <span className="game-shell-stat-label">{timeLabel}</span>
              <span className={`game-shell-stat-value${isLowTime ? ' is-low' : ''}`}>
                {timeDisplay}
              </span>
            </div>
            <div className="game-shell-stat">
              <span className="game-shell-stat-label">Score</span>
              <span className="game-shell-stat-value">{scoreDisplay}</span>
            </div>
            <div className="game-shell-stat">
              <span className="game-shell-stat-label">Best</span>
              <span className="game-shell-stat-value">{highScore}</span>
            </div>
          </div>
        </header>

        <div className="game-shell-stage">
          {phase !== 'idle' ? (
            <Component
              key={runCount}
              active={phase === 'playing'}
              onScoreChange={handleScoreChange}
              onGameOver={handleGameOver}
            />
          ) : null}

          {phase === 'idle' ? (
            <div className="game-shell-overlay">
              <div className="game-shell-overlay-card">
                <p className="game-shell-cost">
                  <CoinIcon className="game-shell-cost-ico reward-ico-coin" />
                  <strong>{costSummary}</strong>
                </p>
                <button
                  ref={playButtonRef}
                  type="button"
                  className="primary-button game-shell-play"
                  onClick={startSession}
                  disabled={!canAfford}
                >
                  {playLabel}
                </button>
                <p className="game-shell-note">
                  {canAfford
                    ? `You have ${coinBalance.toLocaleString()} ${pluralize(coinBalance, 'coin')}.`
                    : `You have ${coinBalance.toLocaleString()} ${pluralize(coinBalance, 'coin')} — earn more in lessons to play.`}
                </p>
              </div>
            </div>
          ) : null}

          {phase === 'over' ? (
            <div className="game-shell-overlay game-shell-overlay-result">
              <div className="game-shell-overlay-card">
                <p className="game-shell-result-eyebrow">{resultEyebrow}</p>
                <p className="game-shell-result-score">
                  <span className="sr-only">Final score </span>
                  {finalScore}
                </p>
                <p className={`game-shell-result-best${isNewRecord ? ' is-record' : ''}`}>
                  {isNewRecord ? 'New personal best!' : `Best: ${highScore}`}
                </p>
                <GameLeaderboard gameId={game.id} currentScore={finalScore} />
                {endReason === 'coins' ? (
                  // Ran out of coins → the primary action sends the player back to
                  // lessons (where coins are earned) instead of an unaffordable replay.
                  <Link
                    ref={keepLearningRef}
                    to="/dashboard"
                    className="primary-button game-shell-play"
                  >
                    Keep learning
                  </Link>
                ) : (
                  <button
                    ref={playButtonRef}
                    type="button"
                    className="primary-button game-shell-play"
                    onClick={startSession}
                    disabled={!canAfford}
                  >
                    {playAgainLabel}
                  </button>
                )}
                {!canAfford ? (
                  <p className="game-shell-note">
                    {coinBalance.toLocaleString()} {pluralize(coinBalance, 'coin')} left — earn more in lessons.
                  </p>
                ) : null}
                {/* Announce the result once for screen readers without spamming
                    per-tick score/timer updates. */}
                <p role="status" className="sr-only">
                  {resultEyebrow}. Final score {finalScore}.{' '}
                  {isNewRecord ? 'New personal best.' : `Your best is ${highScore}.`}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
