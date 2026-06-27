// 256 (id: 2048): a compact 3x3 take on 2048 with a 256-tile win goal. Arrow keys
// or swipe slide tiles; equal tiles merge (adding to the score) and a 2/4 spawns
// after any change. Reaching 256 shows a banner but play continues; a full board
// with no merges ends the round. Implements the shared contract; the shell owns
// all chrome.
//
// Movement is a pure presentation layer: each tile has a stable identity so it
// SLIDES to its destination, merged pairs "pop", and the spawn fades in once the
// slide settles. The numeric board/scoring/spawn rules are unchanged — only the
// timing (one slide later) and per-tile bookkeeping are new.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, TouchEvent as ReactTouchEvent } from 'react';
import { useGameSound } from './useGameSound';

// Shared game contract, re-declared locally so this file imports nothing shared.
type GameProps = {
  active: boolean;
  onScoreChange: (score: number) => void;
  onGameOver: () => void;
};

// --- Pure board logic --------------------------------------------------------
type Direction = 'up' | 'down' | 'left' | 'right';
type Board = number[]; // length SIZE*SIZE (9), row-major, 0 = empty cell

// 3x3 board (the classic game is 4x4). Exported so tests can assert the grid size
// instead of hard-coding it. Every piece of board logic below derives from SIZE,
// so this single constant drives the whole grid.
export const SIZE = 3;
const CELLS = SIZE * SIZE;
// Reaching this tile wins the round (the classic goal is 2048). The win is a
// celebratory banner only — play CONTINUES afterwards so the player can keep
// pushing for score ("keep going past the goal"). Exported for the tests.
export const WIN_TILE = 256;
const SWIPE_THRESHOLD = 24; // px before a drag counts as a swipe

// A merge feels "satisfying" (the richer 'coin' rather than 'point') when it
// stacks up a sizable tile or chains two+ merges in a single slide.
const SATISFYING_MERGE_TILE = 64;

function emptyBoard(): Board {
  return new Array<number>(CELLS).fill(0);
}

function emptyCells(board: Board): number[] {
  const cells: number[] = [];
  for (let i = 0; i < CELLS; i += 1) {
    if (board[i] === 0) {
      cells.push(i);
    }
  }
  return cells;
}

// Drop a new tile (90% a 2, 10% a 4) into a random empty cell.
function spawnTile(board: Board): Board {
  const cells = emptyCells(board);
  if (cells.length === 0) {
    return board;
  }
  const next = board.slice();
  next[cells[Math.floor(Math.random() * cells.length)]] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function createBoard(): Board {
  return spawnTile(spawnTile(emptyBoard()));
}

// The board indices of each of the 4 lines for a direction, ordered so element 0
// is the leading edge of the slide (where tiles pile up).
function lineIndices(dir: Direction): number[][] {
  const lines: number[][] = [];
  for (let i = 0; i < SIZE; i += 1) {
    const line: number[] = [];
    for (let j = 0; j < SIZE; j += 1) {
      let row: number;
      let col: number;
      if (dir === 'left') {
        row = i;
        col = j;
      } else if (dir === 'right') {
        row = i;
        col = SIZE - 1 - j;
      } else if (dir === 'up') {
        row = j;
        col = i;
      } else {
        row = SIZE - 1 - j;
        col = i;
      }
      line.push(row * SIZE + col);
    }
    lines.push(line);
  }
  return lines;
}

// Slide + merge one line toward index 0. Each pair merges at most once per move;
// `gained` is the sum of every newly-created (merged) tile.
function slideLine(values: number[]): { values: number[]; gained: number } {
  const filtered = values.filter((v) => v !== 0);
  const result: number[] = [];
  let gained = 0;
  for (let i = 0; i < filtered.length; i += 1) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      const merged = filtered[i] * 2;
      result.push(merged);
      gained += merged;
      i += 1; // consume the partner tile
    } else {
      result.push(filtered[i]);
    }
  }
  while (result.length < SIZE) {
    result.push(0);
  }
  return { values: result, gained };
}

function applyDirection(board: Board, dir: Direction): { board: Board; gained: number; moved: boolean } {
  const next = board.slice();
  let gained = 0;
  let moved = false;
  for (const line of lineIndices(dir)) {
    const before = line.map((idx) => board[idx]);
    const { values: after, gained: lineGained } = slideLine(before);
    gained += lineGained;
    for (let k = 0; k < SIZE; k += 1) {
      if (next[line[k]] !== after[k]) {
        moved = true;
      }
      next[line[k]] = after[k];
    }
  }
  return { board: next, gained, moved };
}

// A move is possible if any cell is empty or any orthogonal neighbours match.
function hasMoves(board: Board): boolean {
  if (emptyCells(board).length > 0) {
    return true;
  }
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const v = board[r * SIZE + c];
      if (c + 1 < SIZE && v === board[r * SIZE + c + 1]) {
        return true;
      }
      if (r + 1 < SIZE && v === board[(r + 1) * SIZE + c]) {
        return true;
      }
    }
  }
  return false;
}

// Highest tile value currently on the board (0 for an empty board). Used to spot
// the win the instant a tile reaches the 256 goal.
function maxTile(board: Board): number {
  let max = 0;
  for (let i = 0; i < CELLS; i += 1) {
    if (board[i] > max) {
      max = board[i];
    }
  }
  return max;
}

// --- Animation layer: tile identities + move planning ------------------------
// The numeric board is the source of truth for game logic; this parallel tile
// list (one entry per non-empty cell, each with a stable id) is what we render
// and animate. `merged`/`spawn` flag the one-shot pop/fade-in for freshly
// created tiles only — survivors just slide.
type Tile = {
  id: number;
  value: number;
  row: number;
  col: number;
  merged?: boolean;
  spawn?: boolean;
};

// What a single move does to the tiles, computed with the exact same slide+merge
// rule as `applyDirection` (so the resting positions agree with the board):
//  - destByTileId: where each existing tile slides to (board index)
//  - mergeIndices: destination cells that are the result of a merge (new tile)
//  - survivorByIndex: destination cell -> id of the lone tile that ends there
type MovePlan = {
  destByTileId: Map<number, number>;
  mergeIndices: Set<number>;
  survivorByIndex: Map<number, number>;
};

const CELL_INDICES = Array.from({ length: CELLS }, (_, i) => i);

const SLIDE_MS = 120; // snappy; kept in sync with the CSS `--g2048-slide` var
const MAX_QUEUED = 2; // buffer at most a couple of inputs landing mid-slide

function boardToTiles(board: Board, nextId: () => number): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i < CELLS; i += 1) {
    if (board[i] !== 0) {
      tiles.push({ id: nextId(), value: board[i], row: Math.floor(i / SIZE), col: i % SIZE });
    }
  }
  return tiles;
}

function planMove(tiles: Tile[], dir: Direction): MovePlan {
  const tileAt: (Tile | null)[] = new Array<Tile | null>(CELLS).fill(null);
  for (const tile of tiles) {
    tileAt[tile.row * SIZE + tile.col] = tile;
  }

  const destByTileId = new Map<number, number>();
  const mergeIndices = new Set<number>();
  const survivorByIndex = new Map<number, number>();

  for (const line of lineIndices(dir)) {
    const lineTiles: Tile[] = [];
    for (const idx of line) {
      const tile = tileAt[idx];
      if (tile) {
        lineTiles.push(tile);
      }
    }

    let pos = 0;
    let i = 0;
    while (i < lineTiles.length) {
      const destIndex = line[pos];
      if (i + 1 < lineTiles.length && lineTiles[i].value === lineTiles[i + 1].value) {
        // Both halves of the pair slide onto the destination, then merge.
        destByTileId.set(lineTiles[i].id, destIndex);
        destByTileId.set(lineTiles[i + 1].id, destIndex);
        mergeIndices.add(destIndex);
        i += 2;
      } else {
        destByTileId.set(lineTiles[i].id, destIndex);
        survivorByIndex.set(destIndex, lineTiles[i].id);
        i += 1;
      }
      pos += 1;
    }
  }

  return { destByTileId, mergeIndices, survivorByIndex };
}

// Phase 1: every current tile, re-homed at its destination cell (no flags) so
// changing its transform triggers the slide transition.
function buildSlideTiles(tiles: Tile[], plan: MovePlan): Tile[] {
  return tiles.map((tile) => {
    const dest = plan.destByTileId.get(tile.id) ?? tile.row * SIZE + tile.col;
    return { id: tile.id, value: tile.value, row: Math.floor(dest / SIZE), col: dest % SIZE };
  });
}

// Phase 2: the settled layout for the post-spawn board. Survivors keep their id
// (stay put), merge results and the spawned tile are brand-new ids so their
// one-shot pop/fade-in animations run on mount.
function buildFinalTiles(
  board: Board,
  plan: MovePlan,
  spawnIndex: number,
  animate: boolean,
  nextId: () => number,
): Tile[] {
  const tiles: Tile[] = [];
  for (let idx = 0; idx < CELLS; idx += 1) {
    const value = board[idx];
    if (value === 0) {
      continue;
    }
    const row = Math.floor(idx / SIZE);
    const col = idx % SIZE;
    if (idx === spawnIndex) {
      tiles.push({ id: nextId(), value, row, col, spawn: animate });
    } else if (plan.mergeIndices.has(idx)) {
      tiles.push({ id: nextId(), value, row, col, merged: animate });
    } else {
      const survivorId = plan.survivorByIndex.get(idx);
      tiles.push({ id: survivorId ?? nextId(), value, row, col });
    }
  }
  return tiles;
}

// The single cell that gained a tile from the spawn (or -1 if the board was full).
function findSpawnIndex(before: Board, after: Board): number {
  for (let i = 0; i < CELLS; i += 1) {
    if (before[i] === 0 && after[i] !== 0) {
      return i;
    }
  }
  return -1;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
};

// Tile palette: greens for the early ramp, warming into accents for high tiles —
// all from the brand CSS variables (with literal fallbacks so the game still
// reads cleanly if rendered outside the app shell).
const TILE_COLORS: Record<number, { bg: string; fg: string }> = {
  2: { bg: 'var(--brand-tint, #e4f3ea)', fg: 'var(--brand-strong, #0c6443)' },
  4: { bg: 'var(--brand-tint-strong, #d2ebdc)', fg: 'var(--brand-strong, #0c6443)' },
  8: { bg: 'var(--brand-bright, #2fd27f)', fg: '#07351f' },
  16: { bg: 'var(--brand, #11815a)', fg: '#ffffff' },
  32: { bg: 'var(--brand-strong, #0c6443)', fg: '#ffffff' },
  64: { bg: 'var(--brand-deep, #0b5e3f)', fg: '#ffffff' },
  128: { bg: 'var(--warn, #f5b13d)', fg: '#3a2600' },
  256: { bg: '#f0991f', fg: '#ffffff' },
  512: { bg: 'var(--streak, #f4691f)', fg: '#ffffff' },
  1024: { bg: 'var(--accent, #ff5a4d)', fg: '#ffffff' },
  2048: { bg: '#ff3326', fg: '#ffffff' },
};
const SUPER_TILE = { bg: '#0a4d34', fg: '#9ff0c6' };

function tileColors(value: number) {
  return TILE_COLORS[value] ?? SUPER_TILE;
}

function tileFontSize(value: number): string {
  const digits = String(value).length;
  if (digits >= 4) {
    return 'clamp(0.85rem, 4.4vw, 1.55rem)';
  }
  if (digits === 3) {
    return 'clamp(1.05rem, 5.4vw, 1.95rem)';
  }
  return 'clamp(1.4rem, 7vw, 2.5rem)';
}

const STYLE = `
.g2048-root {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  user-select: none;
  -webkit-user-select: none;
}
.g2048-surface {
  position: relative;
  width: min(420px, 86vw);
  border-radius: var(--r-lg, 24px);
  outline: none;
  touch-action: none;
}
.g2048-board {
  --g2048-gap: clamp(6px, 2.2vw, 12px);
  --g2048-pad: clamp(6px, 2.2vw, 12px);
  position: relative;
  aspect-ratio: 1 / 1;
  background: var(--surface-sunken, #efeadf);
  border: 1px solid var(--line, #e7e1d4);
  border-radius: var(--r-lg, 24px);
  box-shadow: var(--shadow-md, 0 16px 44px rgba(20, 33, 46, 0.09));
  display: grid;
  gap: var(--g2048-gap);
  grid-template-columns: repeat(var(--g2048-size), 1fr);
  grid-template-rows: repeat(var(--g2048-size), 1fr);
  padding: var(--g2048-pad);
  width: 100%;
}
.g2048-cell {
  background: color-mix(in srgb, var(--ink, #14212e) 6%, transparent);
  border-radius: var(--r-sm, 12px);
}
/* Tiles live in an overlay sized to the board's content box (inset by the
   padding). Each tile is sized to one cell and positioned with a transform, so
   sliding is a single animatable property and the math stays gap/padding-exact
   without measuring the DOM. */
.g2048-tiles {
  position: absolute;
  inset: var(--g2048-pad);
  pointer-events: none;
}
.g2048-tile {
  position: absolute;
  top: 0;
  left: 0;
  width: calc((100% - (var(--g2048-size) - 1) * var(--g2048-gap)) / var(--g2048-size));
  height: calc((100% - (var(--g2048-size) - 1) * var(--g2048-gap)) / var(--g2048-size));
  transform: translate(
    calc(var(--g2048-col) * (100% + var(--g2048-gap))),
    calc(var(--g2048-row) * (100% + var(--g2048-gap)))
  );
  transition: transform var(--g2048-slide, 120ms) cubic-bezier(0.22, 0.61, 0.36, 1);
  will-change: transform;
}
.g2048-tile-face {
  align-items: center;
  border-radius: var(--r-sm, 12px);
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.08), 0 2px 6px rgba(20, 33, 46, 0.12);
  display: flex;
  font-weight: 800;
  height: 100%;
  justify-content: center;
  letter-spacing: -0.02em;
  line-height: 1;
  width: 100%;
}
/* Scale animations live on the inner face so they never fight the outer
   translate that positions the tile. */
.g2048-tile-face.is-spawn {
  animation: g2048-spawn 0.14s ease-out;
}
.g2048-tile-face.is-merged {
  animation: g2048-pop 0.16s var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
}
@keyframes g2048-pop {
  0% { transform: scale(1); }
  45% { transform: scale(1.2); }
  100% { transform: scale(1); }
}
@keyframes g2048-spawn {
  0% { transform: scale(0.1); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
.g2048-surface.is-over .g2048-board {
  filter: saturate(0.7) brightness(0.97);
}
.g2048-overlay {
  align-items: center;
  background: color-mix(in srgb, var(--paper, #f5f2ea) 64%, transparent);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  border-radius: var(--r-lg, 24px);
  color: var(--ink, #14212e);
  display: flex;
  font-size: clamp(1.1rem, 5vw, 1.6rem);
  font-weight: 900;
  inset: 0;
  justify-content: center;
  letter-spacing: -0.01em;
  pointer-events: none;
  position: absolute;
}
/* Win banner: a celebratory ribbon pinned to the top of the board. It does NOT
   cover the grid (and is pointer-events: none) so the player can keep going past
   the 256 goal while it stays visible. */
.g2048-banner {
  position: absolute;
  top: clamp(8px, 3vw, 16px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--brand, #11815a);
  color: #ffffff;
  border-radius: var(--r-pill, 999px);
  box-shadow: var(--shadow-md, 0 16px 44px rgba(20, 33, 46, 0.18));
  font-size: clamp(0.8rem, 3.4vw, 1rem);
  font-weight: 900;
  letter-spacing: -0.01em;
  padding: 0.4rem 0.95rem;
  pointer-events: none;
  white-space: nowrap;
  z-index: 2;
}
.g2048-hint {
  color: var(--ink-faint, #6b7280);
  font-size: 0.85rem;
  font-weight: 700;
  margin: 0;
  text-align: center;
}
@media (prefers-reduced-motion: reduce) {
  .g2048-tile { transition: none; }
  .g2048-tile-face.is-spawn,
  .g2048-tile-face.is-merged { animation: none; }
}
`;

// Pushes `--g2048-slide` (keeps the JS settle timer and CSS transition in sync)
// and `--g2048-size` (so the grid template + tile sizing track SIZE) onto the
// board element.
const BOARD_STYLE = {
  '--g2048-slide': `${SLIDE_MS}ms`,
  '--g2048-size': SIZE,
} as CSSProperties;

export function Game2048({ active, onScoreChange, onGameOver }: GameProps) {
  const idRef = useRef(0);
  const nextId = useCallback(() => {
    idRef.current += 1;
    return idRef.current;
  }, []);

  // Stable handle, safe to fire from the closures below.
  const sound = useGameSound(active, 'lounge');

  // Build the first board and its tiles together so the numeric board (game
  // logic) and the tile list (rendering/animation) start in perfect agreement.
  const initialRef = useRef<{ board: Board; tiles: Tile[] } | null>(null);
  if (initialRef.current === null) {
    const board = createBoard();
    initialRef.current = { board, tiles: boardToTiles(board, nextId) };
  }

  const [tiles, setTiles] = useState<Tile[]>(initialRef.current.tiles);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);

  // Mirror live values in refs so the (stable) input handlers never go stale and
  // we can run side effects outside of state updaters.
  const boardRef = useRef<Board>(initialRef.current.board);
  const tilesRef = useRef<Tile[]>(initialRef.current.tiles);
  const scoreRef = useRef(0);
  const activeRef = useRef(active);
  const gameOverRef = useRef(false);
  const wonRef = useRef(false); // latched once 256 is reached so the banner fires once
  const animatingRef = useRef(false);
  const queueRef = useRef<Direction[]>([]);
  const slideTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const onScoreChangeRef = useRef(onScoreChange);
  const onGameOverRef = useRef(onGameOver);
  useEffect(() => {
    onScoreChangeRef.current = onScoreChange;
    onGameOverRef.current = onGameOver;
  }, [onScoreChange, onGameOver]);

  // Single place that keeps the rendered tiles and their ref mirror in sync.
  const commitTiles = (next: Tile[]) => {
    tilesRef.current = next;
    setTiles(next);
  };

  // Resolve one move's logic results into the settled layout. Runs after the
  // slide (or immediately when motion is reduced). The board/score/game-over
  // updates here are the original behaviour — only their timing (one slide
  // later) and the tile bookkeeping are new.
  const settle = (
    nextBoard: Board,
    gained: number,
    plan: MovePlan,
    spawnIndex: number,
    animate: boolean,
  ) => {
    boardRef.current = nextBoard;

    if (gained > 0) {
      const nextScore = scoreRef.current + gained;
      scoreRef.current = nextScore;
      onScoreChangeRef.current(nextScore);
    }

    // Win the instant a tile reaches the 256 goal. This is presentational only:
    // it never calls onGameOver, so the session keeps running and the player can
    // keep going past the goal (the shell stops it on no-moves / coins / time).
    const justWon = !wonRef.current && maxTile(nextBoard) >= WIN_TILE;
    if (justWon) {
      wonRef.current = true;
      setWon(true);
    }

    commitTiles(buildFinalTiles(nextBoard, plan, spawnIndex, animate, nextId));

    const noMoves = !hasMoves(nextBoard);
    if (noMoves) {
      gameOverRef.current = true;
      setOver(true);
      onGameOverRef.current();
    }

    // One settle-time cue, most significant outcome first (the soft slide tick
    // already fired in startMove). Reaching the 256 goal sings the win fanfare; a
    // plain merge pops ('coin' for a chunky/combo merge, else 'point'); game over
    // closes with its own knell.
    if (noMoves) {
      sound.playEffect('gameOver');
    } else if (justWon) {
      sound.playEffect('win');
    } else if (gained > 0) {
      let mergedTop = 0;
      for (const idx of plan.mergeIndices) {
        if (nextBoard[idx] > mergedTop) {
          mergedTop = nextBoard[idx];
        }
      }
      const satisfying = plan.mergeIndices.size >= 2 || mergedTop >= SATISFYING_MERGE_TILE;
      sound.playEffect(satisfying ? 'coin' : 'point');
    }
  };

  // Apply the next buffered input the instant the current animation settles.
  const drainQueue = () => {
    const queued = queueRef.current.shift();
    if (queued) {
      startMove(queued);
    }
  };

  const startMove = (dir: Direction) => {
    if (!activeRef.current || gameOverRef.current) {
      queueRef.current = [];
      animatingRef.current = false;
      return;
    }

    const { board: slid, gained, moved } = applyDirection(boardRef.current, dir);
    if (!moved) {
      drainQueue();
      return;
    }

    // Tiles really shifted — fire the soft slide tick as the motion starts.
    // Guarded by `moved`, so a blocked press (nothing changed) stays silent.
    sound.playEffect('move');

    const plan = planMove(tilesRef.current, dir);
    const spawnedBoard = spawnTile(slid);
    const spawnIndex = findSpawnIndex(slid, spawnedBoard);

    // Reduced motion: skip the slide entirely and place tiles instantly.
    if (prefersReducedMotion()) {
      settle(spawnedBoard, gained, plan, spawnIndex, false);
      drainQueue();
      return;
    }

    // Phase 1 — slide every existing tile from where it sits to its destination
    // (merging pairs converge on one cell). Same keys = same DOM nodes, so the
    // CSS transform transition animates the move.
    animatingRef.current = true;
    commitTiles(buildSlideTiles(tilesRef.current, plan));

    // Phase 2 — once the slide finishes, swap the merged pair for the summed
    // tile (pop), fade the spawned tile in, and apply the logic.
    slideTimerRef.current = window.setTimeout(() => {
      slideTimerRef.current = null;
      if (!mountedRef.current) {
        return;
      }
      settle(spawnedBoard, gained, plan, spawnIndex, true);
      animatingRef.current = false;
      drainQueue();
    }, SLIDE_MS);
  };

  const move = (dir: Direction) => {
    if (!activeRef.current || gameOverRef.current) {
      return;
    }
    // Buffer input that lands mid-slide so the board can never desync; it is
    // applied the instant the current animation settles.
    if (animatingRef.current) {
      if (queueRef.current.length < MAX_QUEUED) {
        queueRef.current.push(dir);
      }
      return;
    }
    startMove(dir);
  };

  // Keep the latest `move` reachable from the stable event handlers without
  // re-subscribing them on every render.
  const moveRef = useRef(move);
  moveRef.current = move;

  // Start with the paid session; wipe to a fresh board every time it turns on
  // and cancel any in-flight animation when it turns off.
  useEffect(() => {
    activeRef.current = active;
    if (slideTimerRef.current !== null) {
      clearTimeout(slideTimerRef.current);
      slideTimerRef.current = null;
    }
    animatingRef.current = false;
    queueRef.current = [];

    if (!active) {
      return;
    }

    const fresh = createBoard();
    boardRef.current = fresh;
    scoreRef.current = 0;
    gameOverRef.current = false;
    wonRef.current = false;
    const freshTiles = boardToTiles(fresh, nextId);
    tilesRef.current = freshTiles;
    setTiles(freshTiles);
    setOver(false);
    setWon(false);
    onScoreChangeRef.current(0);
  }, [active, nextId]);

  // Keyboard control — bound only while active and removed on active=false /
  // unmount. preventDefault stops the arrow keys from scrolling the page.
  useEffect(() => {
    if (!active) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const dir = KEY_DIRECTIONS[event.key];
      if (!dir) {
        return;
      }
      event.preventDefault();
      moveRef.current(dir);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active]);

  // Tear-down guard: stop pending settle callbacks from touching an unmounted
  // component (and clear the timer).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (slideTimerRef.current !== null) {
        clearTimeout(slideTimerRef.current);
        slideTimerRef.current = null;
      }
    };
  }, []);

  // Focus the play area when a session starts so it's immediately keyboard-ready.
  const surfaceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) {
      surfaceRef.current?.focus({ preventScroll: true });
    }
  }, [active]);

  // Touch swipe (scroll is suppressed via touch-action: none on the surface).
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) {
      return;
    }
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) {
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      moveRef.current(dx > 0 ? 'right' : 'left');
    } else {
      moveRef.current(dy > 0 ? 'down' : 'up');
    }
  };

  const showOverlay = over && active;
  const showWin = won && active;

  return (
    <div className="g2048-root">
      <style>{STYLE}</style>
      <div
        ref={surfaceRef}
        className={`g2048-surface${showOverlay ? ' is-over' : ''}`}
        role="application"
        aria-label={`256 puzzle on a 3 by 3 grid. Merge tiles to reach ${WIN_TILE}. Use the arrow keys or swipe to slide and merge tiles.`}
        tabIndex={0}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="g2048-board" style={BOARD_STYLE}>
          {CELL_INDICES.map((index) => (
            <div className="g2048-cell" key={index} />
          ))}
          <div className="g2048-tiles">
            {tiles.map((tile) => {
              const palette = tileColors(tile.value);
              const positionStyle = {
                '--g2048-col': tile.col,
                '--g2048-row': tile.row,
              } as CSSProperties;
              const faceClass = `g2048-tile-face${tile.merged ? ' is-merged' : ''}${
                tile.spawn ? ' is-spawn' : ''
              }`;
              return (
                <div className="g2048-tile" key={tile.id} style={positionStyle}>
                  <div
                    className={faceClass}
                    style={{
                      background: palette.bg,
                      color: palette.fg,
                      fontSize: tileFontSize(tile.value),
                    }}
                  >
                    {tile.value}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {showWin ? (
          <div className="g2048-banner" role="status">
            You win! Reached {WIN_TILE} — keep going!
          </div>
        ) : null}
        {showOverlay ? (
          <div className="g2048-overlay" role="status">
            No moves left
          </div>
        ) : null}
      </div>
      <p className="g2048-hint">Use arrow keys or swipe to merge matching tiles up to {WIN_TILE}.</p>
    </div>
  );
}
