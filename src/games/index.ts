// Arcade game registry — the single shared contract between the infrastructure
// (shell / page / currency hook) and the individual game components. INFRA owns
// this file; each game worker owns exactly one `src/games/<Game>.tsx` and imports
// the `GameProps` contract from here.
//
// NOTE: this module imports all nine game components, so a whole-project type
// check stays red until every game file lands. That is expected during the
// concurrent build; the coordinator runs final verification.
import type { ComponentType } from 'react';
import { auth, db } from '../lib/firebase';
import { resetCloudGameScores, resetGameScores } from './gameScores';
import { FlappyBird } from './FlappyBird';
import { DinoRun } from './DinoRun';
import { Snake } from './Snake';
import { WhackAMole } from './WhackAMole';
import { ReactionTrainer } from './ReactionTrainer';
import { Game2048 } from './Game2048';
import { StackTower } from './StackTower';
import { TetrisGame } from './TetrisGame';
import { SlopeRun } from './SlopeRun';

/**
 * The contract EVERY game component implements. The shell drives `active`
 * (true only while a paid session timer is running) and listens for score
 * changes + an early game-over. Games never persist high scores or render
 * Play/timer chrome — the shell does all of that.
 */
export type GameProps = {
  /**
   * True while the paid session timer is running. Start the game loop when this
   * becomes true; stop/freeze and clean up (cancel rAF/intervals/listeners)
   * when it becomes false (and on unmount).
   */
  active: boolean;
  /** Report the player's current score whenever it changes. */
  onScoreChange: (score: number) => void;
  /** Call when the player loses BEFORE time runs out (shell ends the session). */
  onGameOver: () => void;
};

/**
 * How a game charges coins for play:
 *
 *  • `per-second` — no fixed time limit. The shell deducts `coinsPerSecond` once
 *    per second of play and the session runs until the player loses (onGameOver)
 *    or the balance can no longer afford the next second.
 *  • `fixed` — an upfront `coinCost` buys a single `durationSeconds` countdown;
 *    the session ends when the timer hits 0 or the player loses.
 */
export type GameBilling =
  | { mode: 'per-second'; coinsPerSecond: number }
  | { mode: 'fixed'; coinCost: number; durationSeconds: number };

/** One arcade game: its display meta, coin billing, and component. */
export type GameDefinition = {
  id: string;
  name: string;
  description: string;
  billing: GameBilling;
  Component: ComponentType<GameProps>;
};

/**
 * All arcade games, in display order. Endless skill games bill per second (play
 * until you lose / run out of coins); the two short reflex games keep a fixed
 * upfront cost for a set duration.
 */
export const games: GameDefinition[] = [
  {
    id: 'flappy-bird',
    name: 'Flappy',
    description: 'Flap through the gaps as long as you can.',
    billing: { mode: 'per-second', coinsPerSecond: 2 },
    Component: FlappyBird,
  },
  {
    id: 'dino-run',
    name: 'Dino Run',
    description: 'Jump and duck past obstacles.',
    billing: { mode: 'per-second', coinsPerSecond: 1 },
    Component: DinoRun,
  },
  {
    id: 'snake',
    name: 'Snake',
    description: "Eat, grow, and don't bite yourself.",
    billing: { mode: 'per-second', coinsPerSecond: 1 },
    Component: Snake,
  },
  {
    id: 'whack-a-mole',
    name: 'Whack-a-Mole',
    description: 'Bonk the moles before they vanish.',
    billing: { mode: 'fixed', coinCost: 40, durationSeconds: 30 },
    Component: WhackAMole,
  },
  {
    id: 'reaction-trainer',
    name: 'Reaction',
    description: 'Tap targets the instant they appear.',
    billing: { mode: 'fixed', coinCost: 30, durationSeconds: 30 },
    Component: ReactionTrainer,
  },
  {
    id: '2048',
    name: '256',
    description: 'Merge tiles for the highest score.',
    billing: { mode: 'per-second', coinsPerSecond: 1 },
    Component: Game2048,
  },
  {
    id: 'stack-tower',
    name: 'Stack',
    description: 'Stack the blocks as high as you can.',
    billing: { mode: 'per-second', coinsPerSecond: 1 },
    Component: StackTower,
  },
  {
    id: 'tetris',
    name: 'Tetris',
    description: 'Clear lines for as long as you can last.',
    billing: { mode: 'per-second', coinsPerSecond: 1 },
    Component: TetrisGame,
  },
  {
    id: 'slope',
    name: 'Slope',
    description: 'Steer the ball down the endless neon slope.',
    billing: { mode: 'per-second', coinsPerSecond: 1 },
    Component: SlopeRun,
  },
];

/** Look up a single game definition by id. */
export function getGameById(gameId: string): GameDefinition | undefined {
  return games.find((game) => game.id === gameId);
}

// ---------------------------------------------------------------------------
// Per-game high scores. Persisted locally, one entry per game id. The shell
// writes them at the end of a session; the page reads them for the card display.
// ---------------------------------------------------------------------------
export const arcadeHighScoreStorageKeyPrefix = 'brilliant-clone.arcade-highscore.';

export function arcadeHighScoreStorageKey(gameId: string): string {
  return `${arcadeHighScoreStorageKeyPrefix}${gameId}`;
}

/** Reads a game's stored high score (0 when unset or invalid). */
export function readArcadeHighScore(gameId: string): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  const raw = window.localStorage.getItem(arcadeHighScoreStorageKey(gameId));
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Persists a game's high score only when it beats the stored one. Returns the
 * resulting best score so callers can reflect a new record immediately.
 */
export function saveArcadeHighScore(gameId: string, score: number): number {
  const candidate = Number.isFinite(score) && score > 0 ? Math.floor(score) : 0;
  const previousBest = readArcadeHighScore(gameId);

  if (candidate <= previousBest) {
    return previousBest;
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(arcadeHighScoreStorageKey(gameId), String(candidate));
  }

  return candidate;
}

/**
 * Removes EVERY per-game high-score entry from localStorage. Clears both the
 * currently-registered game ids (from the {@link games} registry) AND any other
 * key under {@link arcadeHighScoreStorageKeyPrefix} — so a best left behind by a
 * game since removed from the registry is swept too. It ALSO clears every
 * per-game lifetime leaderboard store (via {@link resetGameScores}). When signed
 * in with Firestore available it ALSO deletes the player's GLOBAL cloud best for
 * every registered game (best-effort). Used by the reset-progress flow so
 * resetting wipes arcade high scores and leaderboards (local + cloud) alongside
 * lessons, XP, and coins.
 */
export function resetGameHighScores(): void {
  if (typeof window === 'undefined') {
    return;
  }

  // Remove the known registry ids first.
  for (const game of games) {
    window.localStorage.removeItem(arcadeHighScoreStorageKey(game.id));
  }

  // Then sweep any remaining prefixed keys (e.g. retired game ids). Collect
  // first, since removing during iteration shifts the localStorage indices.
  const prefixedKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(arcadeHighScoreStorageKeyPrefix)) {
      prefixedKeys.push(key);
    }
  }

  for (const key of prefixedKeys) {
    window.localStorage.removeItem(key);
  }

  // Also clear the per-game LOCAL leaderboard stores so a progress reset wipes
  // every arcade score store, not just the single-best high scores above.
  resetGameScores();

  // When signed in with Firestore available, also delete the player's GLOBAL
  // cloud best for every registered game so a reset clears their board entries
  // too. Fire-and-forget + best-effort: a transient failure just leaves stale
  // cloud rows, which the player's next run overwrites.
  if (db && auth?.currentUser) {
    void resetCloudGameScores(
      db,
      auth.currentUser.uid,
      games.map((game) => game.id),
    ).catch(() => {
      // Ignore: the local stores are already cleared.
    });
  }
}
