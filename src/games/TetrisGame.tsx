// Tetris (id: tetris): a self-contained React + Canvas minigame. Runs the
// falling-block sprint while `active`, reports score via `onScoreChange`, and
// signals `onGameOver` on a top-out; the shell owns all chrome.
//
// Line clears flash, throw a spark fountain, then collapse; bigger clears shake
// the well and a 4-line "Tetris" adds a wash. All animation honours
// prefers-reduced-motion (falling back to an instant clear).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useGameSound } from './useGameSound';

// Shared game contract, re-declared locally so this file imports nothing shared.
type GameProps = {
  active: boolean;
  onScoreChange: (score: number) => void;
  onGameOver: () => void;
};

// ---------------------------------------------------------------------------
// Pure game model (no React) — easy to reason about and to unit test.
// ---------------------------------------------------------------------------

type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
type Board = (PieceType | null)[][];

// Playfield grid — a touch smaller than the classic 10x20. Cells are scaled up
// (28 -> 35) so the board keeps the exact same 280x560 footprint and 1:2 aspect.
export const COLS = 8;
export const ROWS = 16;
const CELL = 35; // logical px per cell on the board canvas
const BOARD_W = COLS * CELL; // 8 * 35 = 280 (footprint unchanged from the old 10x20 @ 28px)
const BOARD_H = ROWS * CELL; // 16 * 35 = 560
const PREVIEW_W = 96;
const PREVIEW_H = 72;
const PREVIEW_CELL = 16;

export const PIECES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
// Classic line-clear rewards (index = lines cleared at once), scaled by level.
const LINE_SCORES = [0, 100, 300, 500, 800];

type Palette = {
  I: string;
  O: string;
  T: string;
  S: string;
  Z: string;
  J: string;
  L: string;
  grid: string;
  surface: string;
};

// Classic tetromino hues, aligned with the SlopeWise brand tokens. Used as the
// model's default palette and as fallbacks when CSS variables aren't resolvable.
const FALLBACK_PALETTE: Palette = {
  I: '#22b8cf',
  O: '#f5b13d',
  T: '#845ef7',
  S: '#2fd27f',
  Z: '#ff5a4d',
  J: '#3b82f6',
  L: '#f4691f',
  grid: '#e7e1d4',
  surface: '#efeadf',
};

// Deep brand-navy "screen" the pieces sit on, so colours and sparks pop.
const WELL_TOP = '#1b2c44';
const WELL_BOT = '#0d1726';
const MAX_SHAKE_PX = 5;
const SHAKE_DECAY_MS = 320;

// Spawn matrices (rotation state 0). Each value of 1 marks a filled cell.
const SHAPES: Record<PieceType, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

/** Rotate a square matrix 90° clockwise. */
function rotateCW(m: number[][]): number[][] {
  const n = m.length;
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      out[i][j] = m[n - 1 - j][i];
    }
  }
  return out;
}

// Precompute all four rotation states for every piece once at module load.
const ROTATIONS: Record<PieceType, number[][][]> = (() => {
  const out = {} as Record<PieceType, number[][][]>;
  for (const piece of PIECES) {
    const states: number[][][] = [SHAPES[piece]];
    let current = SHAPES[piece];
    for (let r = 1; r < 4; r += 1) {
      current = rotateCW(current);
      states.push(current);
    }
    out[piece] = states;
  }
  return out;
})();

// A line-clear animation in flight: which rows are vanishing, when it began and
// how long the flash + collapse phases last (scaled by how many rows cleared).
type ClearAnim = {
  rows: number[];
  start: number;
  flashDur: number;
  collapseDur: number;
  count: number;
};

// A single spark thrown up from a cleared line. Positions are in board px.
type Particle = {
  x: number;
  y: number;
  vx: number; // px per ms
  vy: number; // px per ms
  life: number; // ms remaining
  maxLife: number;
  size: number;
  color: string;
};

// Sound cues the pure model records on key events. The component drains and
// plays them, so the model itself stays audio-free (it only logs what happened).
type SfxCue = 'land' | 'clearLine' | 'win' | 'levelUp';

type GameState = {
  board: Board;
  queue: PieceType[];
  piece: PieceType;
  rot: number;
  px: number;
  py: number;
  score: number;
  lines: number;
  dropAcc: number; // ms accumulated toward the next gravity step
  lastTime: number; // timestamp of the previous frame
  startTime: number; // when this session began
  over: boolean;
  overSignaled: boolean; // guards a single onGameOver() call
  palette: Palette; // resolved colours, captured so the model can tint sparks
  reducedMotion: boolean; // when true, clears are instant (no animation)
  clearing: ClearAnim | null; // active line-clear animation, if any
  particles: Particle[]; // live spark fountain
  shake: number; // 0..1 screen-shake intensity, decays over time
  sfx: SfxCue[]; // sound cues queued this step, played + cleared by the component
};

function createEmptyBoard(): Board {
  return Array.from({ length: ROWS }, () => new Array<PieceType | null>(COLS).fill(null));
}

/** Append a freshly shuffled 7-bag to the queue (no droughts, no floods). */
function refillBag(g: GameState): void {
  const bag = [...PIECES];
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  g.queue.push(...bag);
}

/** True if `shape` placed at (px, py) overlaps a wall, the floor, or a block. */
function collides(board: Board, shape: number[][], px: number, py: number): boolean {
  const n = shape.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (!shape[i][j]) continue;
      const x = px + j;
      const y = py + i;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && board[y][x]) return true; // y < 0 is the spawn buffer above the field
    }
  }
  return false;
}

/**
 * Remove every fully filled row, dropping the rest down. Pure: returns a new
 * board plus the number of rows cleared. Exported for the co-located test.
 */
export function clearCompletedRows(board: Board): { board: Board; cleared: number } {
  const survivors = board.filter((row) => row.some((cell) => cell === null));
  const cleared = board.length - survivors.length;
  const next: Board = [];
  for (let i = 0; i < cleared; i += 1) {
    next.push(new Array<PieceType | null>(COLS).fill(null));
  }
  next.push(...survivors);
  return { board: next, cleared };
}

/**
 * Indices of every fully filled row, top to bottom. Drives the clear animation
 * (which rows flash / how far survivors slide). Pure; exported for the test.
 */
export function fullRowIndices(board: Board): number[] {
  const out: number[] = [];
  for (let r = 0; r < board.length; r += 1) {
    if (board[r].every((cell) => cell !== null)) out.push(r);
  }
  return out;
}

/** How many cleared rows sit below row `r` (i.e. how far it will fall). */
function clearedRowsBelow(rows: number[], r: number): number {
  let n = 0;
  for (const cr of rows) if (cr > r) n += 1;
  return n;
}

/** The centered spawn column for a piece's rotation-0 matrix (top of the well). */
function spawnColumn(piece: PieceType): number {
  return Math.floor((COLS - ROTATIONS[piece][0].length) / 2);
}

/**
 * True if `piece` spawns fully inside the well on a fresh board — centered at the
 * top with no wall/floor collision. Exported so the test can confirm every
 * tetromino (the 4-wide I included) still fits at the reduced board width.
 */
export function spawnsInBounds(piece: PieceType): boolean {
  return !collides(createEmptyBoard(), ROTATIONS[piece][0], spawnColumn(piece), 0);
}

/** Pull the next piece from the bag and seat it at the top; flag a top-out. */
function spawnNext(g: GameState): void {
  if (g.queue.length < PIECES.length) refillBag(g);
  const piece = g.queue.shift() as PieceType;
  g.piece = piece;
  g.rot = 0;
  g.px = spawnColumn(piece);
  g.py = 0;
  if (collides(g.board, ROTATIONS[piece][0], g.px, g.py)) {
    g.over = true;
  }
}

function createGame(now: number, palette: Palette = FALLBACK_PALETTE, reducedMotion = false): GameState {
  const g: GameState = {
    board: createEmptyBoard(),
    queue: [],
    piece: 'I',
    rot: 0,
    px: 0,
    py: 0,
    score: 0,
    lines: 0,
    dropAcc: 0,
    lastTime: 0,
    startTime: now,
    over: false,
    overSignaled: false,
    palette,
    reducedMotion,
    clearing: null,
    particles: [],
    shake: 0,
    sfx: [],
  };
  refillBag(g);
  spawnNext(g);
  return g;
}

/**
 * Lock the active piece into the board, then either clear lines instantly
 * (reduced motion) or kick off the flash/collapse animation. Scoring and line
 * counts update immediately in both paths so the shell stays responsive.
 */
function lockPiece(g: GameState): void {
  const shape = ROTATIONS[g.piece][g.rot];
  const n = shape.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (!shape[i][j]) continue;
      const x = g.px + j;
      const y = g.py + i;
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
        g.board[y][x] = g.piece;
      }
    }
  }

  const fullRows = fullRowIndices(g.board);
  if (fullRows.length > 0) {
    const prevLevel = Math.floor(g.lines / 10);
    g.lines += fullRows.length;
    const level = Math.floor(g.lines / 10);
    g.score += LINE_SCORES[fullRows.length] * (level + 1);

    // A 4-row "Tetris" earns the bigger 'win' fanfare; 1-3 rows get 'clearLine'.
    // A level-up cue chases it whenever the line count crosses a new ten.
    g.sfx.push(fullRows.length >= 4 ? 'win' : 'clearLine');
    if (level > prevLevel) g.sfx.push('levelUp');

    if (g.reducedMotion) {
      g.board = clearCompletedRows(g.board).board;
      spawnNext(g);
    } else {
      const count = fullRows.length;
      g.clearing = {
        rows: fullRows,
        start: nowMs(),
        flashDur: 130 + (count - 1) * 26,
        collapseDur: 165 + (count - 1) * 24,
        count,
      };
      spawnClearParticles(g, fullRows);
      g.shake = clamp(0.12 + count * 0.22, 0, 1);
      // The next piece is held back until the animation resolves (see advanceClearing).
    }
  } else {
    // A piece settled without completing a row — a soft landing thunk.
    g.sfx.push('land');
    spawnNext(g);
  }
}

/** One gravity tick: fall one row, or lock if the piece has landed. */
function gravityStep(g: GameState): void {
  if (!collides(g.board, ROTATIONS[g.piece][g.rot], g.px, g.py + 1)) {
    g.py += 1;
  } else {
    lockPiece(g);
  }
}

/** Lowest y the current piece can reach straight down (ghost position). */
function ghostDropY(g: GameState): number {
  const shape = ROTATIONS[g.piece][g.rot];
  let y = g.py;
  while (!collides(g.board, shape, g.px, y + 1)) y += 1;
  return y;
}

/** Drop interval (ms): quickens with both lines cleared and elapsed time. */
function dropIntervalFor(g: GameState, time: number): number {
  const elapsed = time - g.startTime;
  const level = Math.floor(g.lines / 10) + Math.floor(elapsed / 22000);
  return Math.max(85, 800 - level * 62);
}

// ---------------------------------------------------------------------------
// Line-clear animation + particles (advanced each frame from the React loop).
// ---------------------------------------------------------------------------

/** Throw a spark fountain up from each cleared row, tinted by the cells. */
function spawnClearParticles(g: GameState, rows: number[]): void {
  const perRow = 12;
  const count = rows.length;
  for (const r of rows) {
    const cy = r * CELL + CELL / 2;
    for (let k = 0; k < perRow; k += 1) {
      const x = Math.random() * BOARD_W;
      const col = clampInt(Math.floor(x / CELL), 0, COLS - 1);
      const type = g.board[r][col];
      const base = type ? g.palette[type] : g.palette.I;
      const useWhite = Math.random() < 0.4;
      // Mostly upward, fanned out along the line.
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25;
      const speed = 0.05 + Math.random() * 0.15 + count * 0.005;
      const maxLife = 360 + Math.random() * 340;
      g.particles.push({
        x,
        y: cy + (Math.random() - 0.5) * CELL * 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: maxLife,
        maxLife,
        size: 1.5 + Math.random() * 2.3,
        color: useWhite ? '#ffffff' : lightenCss(base, 0.25),
      });
    }
  }
  // Guard against runaway counts on rapid stacked clears.
  if (g.particles.length > 400) g.particles.splice(0, g.particles.length - 400);
}

/** Resolve the clear once its flash + collapse phases have elapsed. */
function advanceClearing(g: GameState, time: number): void {
  const c = g.clearing;
  if (!c) return;
  if (time - c.start >= c.flashDur + c.collapseDur) {
    g.board = clearCompletedRows(g.board).board;
    g.clearing = null;
    g.dropAcc = 0;
    spawnNext(g);
  }
}

/** Integrate particles + decay the screen shake by `dt` ms. */
function updateEffects(g: GameState, dt: number): void {
  if (g.shake > 0) g.shake = Math.max(0, g.shake - dt / SHAKE_DECAY_MS);
  if (g.particles.length) {
    const gravity = 0.0011; // px per ms^2
    for (const p of g.particles) {
      p.life -= dt;
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    g.particles = g.particles.filter((p) => p.life > 0);
  }
}

// ---------------------------------------------------------------------------
// Rendering helpers.
// ---------------------------------------------------------------------------

/** Resolve the on-brand palette from CSS variables, with safe fallbacks. */
function readPalette(): Palette {
  const read = (name: string, fallback: string): string => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  };
  return {
    I: '#22b8cf',
    O: read('--warn', FALLBACK_PALETTE.O),
    T: '#845ef7',
    S: read('--brand-bright', FALLBACK_PALETTE.S),
    Z: read('--accent', FALLBACK_PALETTE.Z),
    J: read('--info', FALLBACK_PALETTE.J),
    L: read('--streak', FALLBACK_PALETTE.L),
    grid: read('--line', FALLBACK_PALETTE.grid),
    surface: read('--surface-sunken', FALLBACK_PALETTE.surface),
  };
}

// --- tiny colour utilities (hex / rgb aware, fail-soft) --------------------

type RGB = { r: number; g: number; b: number };

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function clampInt(v: number, min: number, max: number): number {
  return Math.round(clamp(v, min, max));
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function parseColor(input: string): RGB | null {
  if (!input) return null;
  const s = input.trim();
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length === 6) {
      const n = Number.parseInt(hex, 16);
      if (!Number.isNaN(n)) return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    return null;
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map((x) => Number.parseFloat(x));
    if (parts.length >= 3 && parts.every((p, i) => i > 2 || !Number.isNaN(p))) {
      return { r: parts[0], g: parts[1], b: parts[2] };
    }
  }
  return null;
}

function mix(rgb: RGB, target: number, amt: number): RGB {
  return {
    r: rgb.r + (target - rgb.r) * amt,
    g: rgb.g + (target - rgb.g) * amt,
    b: rgb.b + (target - rgb.b) * amt,
  };
}

const lighten = (rgb: RGB, amt: number): RGB => mix(rgb, 255, amt);
const darken = (rgb: RGB, amt: number): RGB => mix(rgb, 0, amt);
const rgbCss = (rgb: RGB): string => `rgb(${clampByte(rgb.r)}, ${clampByte(rgb.g)}, ${clampByte(rgb.b)})`;

function lightenCss(color: string, amt: number): string {
  const c = parseColor(color);
  return c ? rgbCss(lighten(c, amt)) : color;
}

function withAlpha(color: string, a: number): string {
  const c = parseColor(color);
  return c ? `rgba(${clampByte(c.r)}, ${clampByte(c.g)}, ${clampByte(c.b)}, ${a})` : color;
}

/** Trace a rounded-rect path (no reliance on the newer ctx.roundRect). */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Paint one glossy gel block: vertical gradient, top sheen, rim light, edge. */
function paintCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  const rgb = parseColor(color) ?? { r: 120, g: 130, b: 140 };
  const pad = Math.max(1, size * 0.05);
  const x0 = x + pad;
  const y0 = y + pad;
  const s = size - pad * 2;
  const r = Math.max(2, s * 0.2);

  const body = ctx.createLinearGradient(x0, y0, x0, y0 + s);
  body.addColorStop(0, rgbCss(lighten(rgb, 0.36)));
  body.addColorStop(0.48, rgbCss(lighten(rgb, 0.04)));
  body.addColorStop(0.52, rgbCss(darken(rgb, 0.02)));
  body.addColorStop(1, rgbCss(darken(rgb, 0.3)));
  roundRectPath(ctx, x0, y0, s, s, r);
  ctx.fillStyle = body;
  ctx.fill();

  // Top gloss highlight.
  roundRectPath(ctx, x0 + s * 0.14, y0 + s * 0.1, s * 0.72, s * 0.32, r * 0.6);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fill();

  // Inner rim light for the modern "lit edge" look.
  const rim = Math.max(1, size * 0.05);
  roundRectPath(ctx, x0 + rim / 2, y0 + rim / 2, s - rim, s - rim, Math.max(1, r - rim / 2));
  ctx.lineWidth = rim;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.stroke();

  // Subtle dark outer edge so neighbours of the same colour stay distinct.
  roundRectPath(ctx, x0 + 0.5, y0 + 0.5, s - 1, s - 1, r);
  ctx.lineWidth = 1;
  ctx.strokeStyle = withAlpha(rgbCss(darken(rgb, 0.5)), 0.55);
  ctx.stroke();
}

// Cache one rendered sprite per colour+size so the per-frame cost is a drawImage
// rather than a stack of gradient/path ops for every locked cell.
const spriteCache = new Map<string, HTMLCanvasElement | null>();

function getCellSprite(color: string, size: number): HTMLCanvasElement | null {
  const key = `${color}|${size}`;
  const cached = spriteCache.get(key);
  if (cached !== undefined) return cached;
  let sprite: HTMLCanvasElement | null = null;
  try {
    if (typeof document !== 'undefined') {
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(size * dpr);
      canvas.height = Math.ceil(size * dpr);
      const cx = canvas.getContext('2d');
      if (cx) {
        cx.scale(dpr, dpr);
        paintCell(cx, 0, 0, size, color);
        sprite = canvas;
      }
    }
  } catch {
    sprite = null;
  }
  spriteCache.set(key, sprite);
  return sprite;
}

/** Draw a block, preferring the cached sprite and falling back to direct paint. */
function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  const sprite = getCellSprite(color, size);
  if (sprite) ctx.drawImage(sprite, x, y, size, size);
  else paintCell(ctx, x, y, size, color);
}

/** A clean translucent outline for the landing (ghost) position. */
function drawGhostCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  const pad = Math.max(1, CELL * 0.05);
  const x0 = x + pad;
  const y0 = y + pad;
  const s = CELL - pad * 2;
  const r = Math.max(2, s * 0.2);
  roundRectPath(ctx, x0, y0, s, s, r);
  ctx.fillStyle = withAlpha(color, 0.12);
  ctx.fill();
  const lw = Math.max(1.5, CELL * 0.06);
  roundRectPath(ctx, x0 + lw / 2, y0 + lw / 2, s - lw, s - lw, Math.max(1, r - lw / 2));
  ctx.lineWidth = lw;
  ctx.strokeStyle = withAlpha(color, 0.5);
  ctx.stroke();
}

/** Deep navy gradient well with a soft vignette and a faint top sheen. */
function paintWell(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, WELL_TOP);
  bg.addColorStop(1, WELL_BOT);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const vignette = ctx.createRadialGradient(w / 2, h * 0.42, w * 0.18, w / 2, h * 0.52, h * 0.78);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  const sheen = ctx.createLinearGradient(0, 0, 0, h * 0.18);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h * 0.18);
}

/** Subtle inner grid lines for the playfield. */
function drawGrid(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < COLS; c += 1) {
    const x = c * CELL + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, BOARD_H);
  }
  for (let r = 1; r < ROWS; r += 1) {
    const y = r * CELL + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(BOARD_W, y);
  }
  ctx.stroke();
}

/** Render the in-flight line clear: flashing rows + survivors sliding down. */
function drawClearing(ctx: CanvasRenderingContext2D, g: GameState, pal: Palette, time: number): void {
  const c = g.clearing;
  if (!c) return;
  const elapsed = time - c.start;
  const inFlash = elapsed < c.flashDur;
  const flashP = clamp(elapsed / c.flashDur, 0, 1);
  const collapseP = clamp((elapsed - c.flashDur) / c.collapseDur, 0, 1);
  const eased = 1 - Math.pow(1 - collapseP, 3); // easeOutCubic
  const cleared = new Set(c.rows);

  // Survivors, each sliding toward its post-collapse home.
  for (let r = 0; r < ROWS; r += 1) {
    if (cleared.has(r)) continue;
    const dy = clearedRowsBelow(c.rows, r) * eased * CELL;
    for (let col = 0; col < COLS; col += 1) {
      const cell = g.board[r][col];
      if (cell) drawCell(ctx, col * CELL, r * CELL + dy, CELL, pal[cell]);
    }
  }

  // Cleared rows: their blocks flash white and fade, then vanish into the collapse.
  if (inFlash) {
    ctx.globalAlpha = 1 - 0.55 * flashP;
    for (const r of c.rows) {
      for (let col = 0; col < COLS; col += 1) {
        const cell = g.board[r][col];
        if (cell) drawCell(ctx, col * CELL, r * CELL, CELL, pal[cell]);
      }
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const a = 0.82 * (1 - flashP) + 0.12;
    for (const r of c.rows) {
      const y = r * CELL;
      const beam = ctx.createLinearGradient(0, y, 0, y + CELL);
      beam.addColorStop(0, 'rgba(255, 255, 255, 0)');
      beam.addColorStop(0.5, `rgba(255, 255, 255, ${a})`);
      beam.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = beam;
      ctx.fillRect(0, y - CELL * 0.15, BOARD_W, CELL * 1.3);
    }
    // A 4-line "Tetris" gets a celebratory brand-green wash across the well.
    if (c.count >= 4) {
      ctx.fillStyle = withAlpha(pal.S, 0.16 * (1 - flashP));
      ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    }
    ctx.restore();
  }
}

/** Additive spark fountain on top of the board. */
function drawParticles(ctx: CanvasRenderingContext2D, g: GameState): void {
  if (!g.particles.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of g.particles) {
    const lifeT = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = lifeT;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * lifeT), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  g: GameState,
  pal: Palette,
  isActive: boolean,
  time: number,
): void {
  ctx.clearRect(0, 0, BOARD_W, BOARD_H);
  paintWell(ctx, BOARD_W, BOARD_H);

  // Shake the playfield contents (not the well backdrop) on big clears.
  const mag = g.shake * MAX_SHAKE_PX;
  ctx.save();
  if (mag > 0.05) {
    ctx.translate((Math.random() * 2 - 1) * mag, (Math.random() * 2 - 1) * mag);
  }

  drawGrid(ctx);

  if (g.clearing) {
    drawClearing(ctx, g, pal, time);
  } else {
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const cell = g.board[r][c];
        if (cell) drawCell(ctx, c * CELL, r * CELL, CELL, pal[cell]);
      }
    }

    if (isActive && !g.over) {
      const shape = ROTATIONS[g.piece][g.rot];
      const ghostY = ghostDropY(g);
      const n = shape.length;
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
          if (shape[i][j] && ghostY + i >= 0) {
            drawGhostCell(ctx, (g.px + j) * CELL, (ghostY + i) * CELL, pal[g.piece]);
          }
        }
      }
      // The live piece glows softly in its own colour.
      ctx.save();
      ctx.shadowColor = withAlpha(pal[g.piece], 0.55);
      ctx.shadowBlur = 12;
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
          if (shape[i][j] && g.py + i >= 0) {
            drawCell(ctx, (g.px + j) * CELL, (g.py + i) * CELL, CELL, pal[g.piece]);
          }
        }
      }
      ctx.restore();
    }
  }

  drawParticles(ctx, g);
  ctx.restore();

  if (g.over) {
    ctx.fillStyle = 'rgba(8, 16, 26, 0.62)';
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 24px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Top out!', BOARD_W / 2, BOARD_H / 2);
  }
}

function drawPreview(ctx: CanvasRenderingContext2D, g: GameState, pal: Palette, isActive: boolean): void {
  ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
  paintWell(ctx, PREVIEW_W, PREVIEW_H);
  if (!isActive || g.over) return;
  const piece = g.queue[0];
  if (!piece) return;
  const shape = ROTATIONS[piece][0];
  const n = shape.length;
  let minR = n;
  let maxR = -1;
  let minC = n;
  let maxC = -1;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (shape[i][j]) {
        minR = Math.min(minR, i);
        maxR = Math.max(maxR, i);
        minC = Math.min(minC, j);
        maxC = Math.max(maxC, j);
      }
    }
  }
  if (maxR < 0) return;
  const w = (maxC - minC + 1) * PREVIEW_CELL;
  const h = (maxR - minR + 1) * PREVIEW_CELL;
  const offX = (PREVIEW_W - w) / 2 - minC * PREVIEW_CELL;
  const offY = (PREVIEW_H - h) / 2 - minR * PREVIEW_CELL;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (shape[i][j]) {
        drawCell(ctx, offX + j * PREVIEW_CELL, offY + i * PREVIEW_CELL, PREVIEW_CELL, pal[piece]);
      }
    }
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/** getContext('2d') that never throws (jsdom test envs have no real canvas). */
function safeContext(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  if (!canvas) return null;
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

function setupCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number): void {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = safeContext(canvas);
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Whether the user prefers reduced motion (fail-soft for jsdom/SSR). */
function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Component.
// ---------------------------------------------------------------------------

type Action = 'left' | 'right' | 'rotate' | 'soft' | 'hard';

export function TetrisGame({ active, onScoreChange, onGameOver }: GameProps) {
  const boardRef = useRef<HTMLCanvasElement | null>(null);
  const nextRef = useRef<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const gameRef = useRef<GameState | null>(null);
  const paletteRef = useRef<Palette | null>(null);
  const reducedMotionRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const repeatRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const lastScoreRef = useRef(-1);
  const lastLinesRef = useRef(-1);

  // Keep the latest callbacks in refs so the loop never restarts when their
  // identities change between renders.
  const onScoreChangeRef = useRef(onScoreChange);
  const onGameOverRef = useRef(onGameOver);
  useEffect(() => {
    onScoreChangeRef.current = onScoreChange;
  }, [onScoreChange]);
  useEffect(() => {
    onGameOverRef.current = onGameOver;
  }, [onGameOver]);

  const [lines, setLines] = useState(0);

  // Stable handle; cues fire on moves, locks, clears and game over.
  const sound = useGameSound(active, 'puzzle');

  const drawAll = useCallback(() => {
    const g = gameRef.current;
    const pal = paletteRef.current;
    if (!g || !pal) return;
    const time = nowMs();
    const bctx = safeContext(boardRef.current);
    if (bctx) drawBoard(bctx, g, pal, activeRef.current, time);
    const nctx = safeContext(nextRef.current);
    if (nctx) drawPreview(nctx, g, pal, activeRef.current);
  }, []);

  // Draw, push score/line changes upward, and fire game-over exactly once.
  const handleAfter = useCallback(() => {
    drawAll();
    const g = gameRef.current;
    if (!g) return;
    // Play and clear cues the model queued this step (piece landings, line
    // clears, level-ups). The engine no-ops while muted or in jsdom.
    if (g.sfx.length > 0) {
      for (const cue of g.sfx) sound.playEffect(cue);
      g.sfx.length = 0;
    }
    if (g.score !== lastScoreRef.current) {
      lastScoreRef.current = g.score;
      onScoreChangeRef.current(g.score);
    }
    if (g.lines !== lastLinesRef.current) {
      lastLinesRef.current = g.lines;
      setLines(g.lines);
    }
    if (g.over && !g.overSignaled) {
      g.overSignaled = true;
      sound.playEffect('gameOver'); // top-out
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      onGameOverRef.current();
    }
  }, [drawAll, sound]);

  const perform = useCallback(
    (action: Action) => {
      if (!activeRef.current) return;
      const g = gameRef.current;
      if (!g || g.over || g.clearing) return; // inputs are inert mid line-clear
      const shape = ROTATIONS[g.piece][g.rot];
      switch (action) {
        case 'left':
          if (!collides(g.board, shape, g.px - 1, g.py)) {
            g.px -= 1;
            sound.playEffect('move');
          }
          break;
        case 'right':
          if (!collides(g.board, shape, g.px + 1, g.py)) {
            g.px += 1;
            sound.playEffect('move');
          }
          break;
        case 'rotate': {
          const nextRot = (g.rot + 1) % 4;
          const rotated = ROTATIONS[g.piece][nextRot];
          for (const kick of [0, -1, 1, -2, 2]) {
            if (!collides(g.board, rotated, g.px + kick, g.py)) {
              g.rot = nextRot;
              g.px += kick;
              sound.playEffect('rotate');
              break;
            }
          }
          break;
        }
        case 'soft':
          if (!collides(g.board, shape, g.px, g.py + 1)) {
            g.py += 1;
            g.score += 1;
            g.dropAcc = 0;
          }
          break;
        case 'hard': {
          let dist = 0;
          while (!collides(g.board, shape, g.px, g.py + 1)) {
            g.py += 1;
            dist += 1;
          }
          g.score += dist * 2;
          g.dropAcc = 0;
          lockPiece(g);
          break;
        }
        default:
          break;
      }
      handleAfter();
    },
    [handleAfter, sound],
  );

  const frame = useCallback(
    (time: number) => {
      if (!activeRef.current) return;
      const g = gameRef.current;
      if (!g) return;
      if (g.lastTime === 0) g.lastTime = time;
      const dt = Math.min(100, time - g.lastTime); // clamp tab-switch jumps
      g.lastTime = time;

      if (!g.over) {
        if (g.clearing) {
          advanceClearing(g, time); // gravity paused while rows resolve
        } else {
          g.dropAcc += dt;
          const interval = dropIntervalFor(g, time);
          let guard = 0;
          while (g.dropAcc >= interval && !g.over && !g.clearing && guard < 6) {
            g.dropAcc -= interval;
            gravityStep(g);
            guard += 1;
          }
        }
      }

      updateEffects(g, dt);
      handleAfter();
      if (!g.over && activeRef.current) {
        rafRef.current = requestAnimationFrame(frame);
      }
    },
    [handleAfter],
  );

  const stopRepeat = useCallback(() => {
    if (repeatRef.current != null) {
      clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
  }, []);

  const startRepeat = useCallback(
    (action: Action) => {
      perform(action);
      stopRepeat();
      repeatRef.current = window.setInterval(() => perform(action), 110);
    },
    [perform, stopRepeat],
  );

  // One-time canvas sizing + palette + an initial idle (empty) board.
  useEffect(() => {
    paletteRef.current = readPalette();
    reducedMotionRef.current = prefersReducedMotion();
    if (boardRef.current) setupCanvas(boardRef.current, BOARD_W, BOARD_H);
    if (nextRef.current) setupCanvas(nextRef.current, PREVIEW_W, PREVIEW_H);
    if (!gameRef.current) {
      gameRef.current = createGame(nowMs(), paletteRef.current, reducedMotionRef.current);
    }
    drawAll();
    return () => {
      stopRepeat();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [drawAll, stopRepeat]);

  // The actual run/stop lifecycle, driven entirely by `active`.
  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      stopRepeat();
      drawAll(); // repaint frozen/idle state without the live piece
      return;
    }

    // Fresh board every time a paid session begins.
    paletteRef.current = paletteRef.current ?? readPalette();
    reducedMotionRef.current = prefersReducedMotion();
    gameRef.current = createGame(nowMs(), paletteRef.current, reducedMotionRef.current);
    lastScoreRef.current = -1;
    lastLinesRef.current = -1;
    sound.playEffect('gameStart'); // punchy cue as a fresh session begins
    handleAfter(); // paints the first frame + reports score 0

    if (!gameRef.current.over) {
      rafRef.current = requestAnimationFrame(frame);
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeRef.current) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          perform('left');
          break;
        case 'ArrowRight':
          event.preventDefault();
          perform('right');
          break;
        case 'ArrowUp':
        case 'x':
        case 'X':
          event.preventDefault();
          perform('rotate');
          break;
        case 'ArrowDown':
          event.preventDefault();
          perform('soft');
          break;
        case ' ':
        case 'Spacebar':
          event.preventDefault();
          perform('hard');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    rootRef.current?.focus?.({ preventScroll: true });

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.removeEventListener('keydown', onKeyDown);
      stopRepeat();
    };
  }, [active, frame, handleAfter, perform, drawAll, stopRepeat, sound]);

  // Pointer/touch on the board: drag horizontally to move, tap to rotate,
  // swipe down to hard-drop.
  const dragRef = useRef({ down: false, startX: 0, startY: 0, lastX: 0, startT: 0, cellW: CELL, moved: false });

  const onBoardPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!activeRef.current) return;
    const rect = boardRef.current?.getBoundingClientRect();
    const cellW = rect ? rect.width / COLS : CELL;
    dragRef.current = {
      down: true,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      startT: nowMs(),
      cellW,
      moved: false,
    };
    boardRef.current?.setPointerCapture?.(event.pointerId);
  };

  const onBoardPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d.down) return;
    const dx = event.clientX - d.lastX;
    if (Math.abs(dx) >= d.cellW) {
      const steps = Math.trunc(dx / d.cellW);
      for (let i = 0; i < Math.abs(steps); i += 1) perform(steps > 0 ? 'right' : 'left');
      d.lastX += steps * d.cellW;
      d.moved = true;
    }
  };

  const onBoardPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d.down) return;
    d.down = false;
    boardRef.current?.releasePointerCapture?.(event.pointerId);
    if (d.moved) return;
    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;
    const dt = nowMs() - d.startT;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 350) {
      perform('rotate');
    } else if (dy > d.cellW * 2 && dy > Math.abs(dx)) {
      perform('hard');
    }
  };

  const holdHandlers = (action: Action) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      startRepeat(action);
    },
    onPointerUp: stopRepeat,
    onPointerLeave: stopRepeat,
    onPointerCancel: stopRepeat,
  });

  const tapHandlers = (action: Action) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      perform(action);
    },
  });

  return (
    <div
      ref={rootRef}
      className="tetris-arcade"
      tabIndex={0}
      role="application"
      aria-label="Tetris. Arrow keys move and rotate, space hard-drops."
      style={rootStyle}
    >
      <style>{scopedCss}</style>
      <div style={playRowStyle}>
        <canvas
          ref={boardRef}
          className="tetris-arcade-board"
          style={boardStyle}
          aria-label="Tetris board"
          onPointerDown={onBoardPointerDown}
          onPointerMove={onBoardPointerMove}
          onPointerUp={onBoardPointerUp}
          onPointerCancel={onBoardPointerUp}
        />
        <div style={sideStyle}>
          <div>
            <div style={sideLabelStyle}>Next</div>
            <canvas ref={nextRef} style={previewStyle} aria-hidden="true" />
          </div>
          <div>
            <div style={sideLabelStyle}>Lines</div>
            <div style={linesValueStyle}>{lines}</div>
          </div>
          <p style={hintStyle}>
            <span aria-hidden="true">◀ ▶</span> move · <span aria-hidden="true">▲</span> rotate ·{' '}
            <span aria-hidden="true">▼</span> soft · space drop
          </p>
        </div>
      </div>

      <div style={touchRowStyle} role="group" aria-label="Touch controls">
        <button type="button" tabIndex={-1} className="tetris-arcade-btn" aria-label="Move left" {...holdHandlers('left')}>
          ◀
        </button>
        <button type="button" tabIndex={-1} className="tetris-arcade-btn" aria-label="Rotate" {...tapHandlers('rotate')}>
          ⟳
        </button>
        <button type="button" tabIndex={-1} className="tetris-arcade-btn" aria-label="Move right" {...holdHandlers('right')}>
          ▶
        </button>
        <button type="button" tabIndex={-1} className="tetris-arcade-btn" aria-label="Soft drop" {...holdHandlers('soft')}>
          ▼
        </button>
        <button
          type="button"
          tabIndex={-1}
          className="tetris-arcade-btn tetris-arcade-btn--accent"
          aria-label="Hard drop"
          {...tapHandlers('hard')}
        >
          ⤓
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles (inline + a small scoped block so this stays in a single file).
// ---------------------------------------------------------------------------

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.85rem',
  outline: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  touchAction: 'manipulation',
};

const playRowStyle: CSSProperties = {
  display: 'flex',
  gap: '1rem',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
  justifyContent: 'center',
};

const boardStyle: CSSProperties = {
  width: `min(${BOARD_W}px, 64vw)`,
  height: 'auto',
  borderRadius: 'var(--r-sm, 12px)',
  border: '1px solid var(--line-strong, #d7cfbe)',
  background: '#0e1a2c',
  boxShadow: 'var(--shadow-md, 0 16px 44px rgba(20,33,46,0.09)), inset 0 1px 0 rgba(255,255,255,0.06)',
  touchAction: 'none',
  cursor: 'pointer',
};

const sideStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.9rem',
  minWidth: 96,
};

const sideLabelStyle: CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-faint, #6b7280)',
  marginBottom: '0.35rem',
};

const previewStyle: CSSProperties = {
  width: 96,
  height: 72,
  borderRadius: 'var(--r-sm, 12px)',
  border: '1px solid var(--line-strong, #d7cfbe)',
  background: '#0e1a2c',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
};

const linesValueStyle: CSSProperties = {
  fontSize: '1.6rem',
  fontWeight: 800,
  color: 'var(--brand-strong, #0c6443)',
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1,
};

const hintStyle: CSSProperties = {
  fontSize: '0.72rem',
  color: 'var(--ink-faint, #6b7280)',
  lineHeight: 1.5,
  margin: 0,
  maxWidth: 120,
};

const touchRowStyle: CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
  justifyContent: 'center',
};

const scopedCss = `
.tetris-arcade:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--brand, #11815a) 55%, transparent);
  outline-offset: 4px;
  border-radius: var(--r-md, 18px);
}
.tetris-arcade-btn {
  width: 52px;
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  line-height: 1;
  color: var(--brand-strong, #0c6443);
  background: var(--brand-tint, #e4f3ea);
  border: 1px solid var(--brand-tint-strong, #d2ebdc);
  border-radius: var(--r-md, 18px);
  cursor: pointer;
  touch-action: manipulation;
  transition: transform 0.06s ease, background 0.12s ease;
}
.tetris-arcade-btn:hover {
  background: var(--brand-tint-strong, #d2ebdc);
}
.tetris-arcade-btn:active {
  transform: translateY(1px) scale(0.96);
}
.tetris-arcade-btn--accent {
  color: #fff;
  background: linear-gradient(135deg, var(--brand, #11815a), var(--brand-strong, #0c6443));
  border-color: transparent;
}
.tetris-arcade-btn--accent:hover {
  background: linear-gradient(135deg, var(--brand-strong, #0c6443), var(--brand-deep, #0b5e3f));
}
@media (prefers-reduced-motion: reduce) {
  .tetris-arcade-btn { transition: none; }
}
`;
