import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useGameSound } from './useGameSound';

// Shared game contract, re-declared locally so this file imports nothing shared.
type GameProps = {
  active: boolean;
  onScoreChange: (score: number) => void;
  onGameOver: () => void;
};

export type Cell = { x: number; y: number };
type Colors = {
  board: string;
  grid: string;
  snake: string;
  snakeHead: string;
  snakeTail: string;
  food: string;
};

// Board geometry + pacing. A compact 9x9 grid with a steady tick keeps the clone
// faithful to classic Snake while fitting the shell's timed sessions. 9 divides the
// 360px max footprint evenly (40px cells) so the board renders without fractional
// (blurry) cells.
export const COLS = 9;
export const ROWS = 9;
const TICK_MS = 130;
const MAX_BOARD = 360;
const MIN_BOARD = 200;
const SWIPE_THRESHOLD = 18;

// Every Nth food (each one also grows the snake by a segment) swaps the plain
// point blip for a brighter "level up" fanfare — a small escalating reward.
const SCORE_MILESTONE = 5;

const FALLBACK_COLORS: Colors = {
  board: '#fffdf8',
  grid: '#e7e1d4',
  snake: '#11815a',
  snakeHead: '#0c6443',
  snakeTail: '#2fd27f',
  food: '#ff5a4d',
};

// Scoped styles travel with the component (mounted/unmounted alongside it) so we
// never touch the shared stylesheet. CSS variables fall back to the brand hexes.
const STYLES = `
.sw-snake-root{display:flex;flex-direction:column;align-items:center;gap:1rem;width:100%;}
.sw-snake-board{position:relative;width:100%;max-width:${MAX_BOARD}px;aspect-ratio:1/1;border-radius:var(--r-lg,24px);overflow:hidden;background:var(--surface,#fffdf8);border:1px solid var(--line,#e7e1d4);box-shadow:var(--shadow-md,0 16px 44px rgba(20,33,46,.09));touch-action:none;user-select:none;-webkit-user-select:none;cursor:default;outline:none;}
.sw-snake-board:focus-visible{outline:3px solid color-mix(in srgb, var(--brand,#11815a) 55%, transparent);outline-offset:2px;}
.sw-snake-canvas{display:block;width:100%;height:100%;}
.sw-snake-hint{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:1rem;color:var(--ink-soft,#51606f);font-weight:800;letter-spacing:.01em;line-height:1.5;background:color-mix(in srgb, var(--surface,#fffdf8) 68%, transparent);pointer-events:none;}
.sw-snake-dpad{display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem;width:100%;max-width:174px;}
.sw-snake-key{appearance:none;border:1px solid var(--line-strong,#d7cfbe);background:var(--surface,#fffdf8);color:var(--brand-strong,#0c6443);border-radius:var(--r-sm,12px);aspect-ratio:1/1;display:grid;place-items:center;font-size:1.1rem;font-weight:900;line-height:1;cursor:pointer;box-shadow:var(--shadow-sm,0 2px 10px rgba(20,33,46,.06));transition:background .16s ease,transform .1s ease,color .16s ease;}
.sw-snake-key:hover{background:var(--brand-tint,#e4f3ea);color:var(--brand-strong,#0c6443);}
.sw-snake-key:active{transform:scale(.92);background:var(--brand-tint-strong,#d2ebdc);}
.sw-snake-key-spacer{visibility:hidden;}
@media (prefers-reduced-motion: reduce){.sw-snake-key{transition:none;}}
`;

export function initialSnake(): Cell[] {
  const cx = Math.floor(COLS / 2);
  const cy = Math.floor(ROWS / 2);
  return [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy },
  ];
}

export function initialFood(): Cell {
  return { x: Math.floor(COLS * 0.75), y: Math.floor(ROWS / 2) };
}

// Pure food placement: pick a uniformly random cell that the snake doesn't
// occupy. Always returns an in-bounds cell (0..COLS-1, 0..ROWS-1) or null when
// the snake fills the whole board. `random` is injectable for deterministic tests.
export function pickFood(snake: Cell[], random: () => number = Math.random): Cell | null {
  const occupied = new Set(snake.map((c) => c.y * COLS + c.x));
  const free: number[] = [];
  const total = COLS * ROWS;
  for (let i = 0; i < total; i += 1) {
    if (!occupied.has(i)) free.push(i);
  }
  if (free.length === 0) return null;
  const idx = free[Math.floor(random() * free.length)];
  return { x: idx % COLS, y: Math.floor(idx / COLS) };
}

function readVar(el: Element, name: string, fallback: string): string {
  try {
    const value = getComputedStyle(el).getPropertyValue(name).trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

function parseColor(color: string): [number, number, number] {
  const value = color.trim();
  if (value.startsWith('rgb')) {
    const parts = value.match(/\d+(\.\d+)?/g);
    if (parts && parts.length >= 3) {
      return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
    }
  }
  let hex = value.startsWith('#') ? value.slice(1) : value;
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = Number.parseInt(hex, 16);
  if (Number.isNaN(num) || hex.length < 6) {
    return [17, 129, 90];
  }
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function mixColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseColor(a);
  const [br, bg, bb] = parseColor(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

function tracePath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawSegment(ctx: CanvasRenderingContext2D, seg: Cell, cell: number, color: string): void {
  const pad = cell * 0.1;
  const size = cell - pad * 2;
  ctx.fillStyle = color;
  tracePath(ctx, seg.x * cell + pad, seg.y * cell + pad, size, size, cell * 0.3);
  ctx.fill();
}

function drawEyes(ctx: CanvasRenderingContext2D, head: Cell, cell: number, dir: Cell): void {
  const cx = head.x * cell + cell / 2;
  const cy = head.y * cell + cell / 2;
  const forward = cell * 0.16;
  const aside = cell * 0.18;
  const perpX = -dir.y;
  const perpY = dir.x;
  const eyeR = cell * 0.1;
  const pupilR = cell * 0.05;

  for (const side of [1, -1]) {
    const ex = cx + dir.x * forward + perpX * aside * side;
    const ey = cy + dir.y * forward + perpY * aside * side;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14212e';
    ctx.beginPath();
    ctx.arc(ex + dir.x * pupilR, ey + dir.y * pupilR, pupilR, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function Snake({ active, onScoreChange, onGameOver }: GameProps) {
  const [score, setScore] = useState(0);
  // True while the game is live but the snake is still parked on its starting
  // cells, waiting for the player's first directional input before it moves.
  const [waiting, setWaiting] = useState(false);

  // Stable handle; the food, milestone, death and steering cues fire below.
  const sound = useGameSound(active, 'serpent');

  // Latest callbacks live in refs so the game loop never restarts just because
  // the shell passed a fresh function identity on re-render.
  const onScoreChangeRef = useRef(onScoreChange);
  const onGameOverRef = useRef(onGameOver);
  useEffect(() => {
    onScoreChangeRef.current = onScoreChange;
  }, [onScoreChange]);
  useEffect(() => {
    onGameOverRef.current = onGameOver;
  }, [onGameOver]);

  // Mutable game state (kept out of React state so ticks don't trigger renders).
  const snakeRef = useRef<Cell[]>(initialSnake());
  const dirRef = useRef<Cell>({ x: 1, y: 0 });
  const dirQueueRef = useRef<Cell[]>([]);
  const foodRef = useRef<Cell | null>(initialFood());
  const scoreRef = useRef(0);
  const runningRef = useRef(false);
  // Mirrors `waiting` for the synchronous input handler, which must read and flip
  // the start state immediately without waiting for a re-render.
  const waitingRef = useRef(false);
  const overRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  // Rendering state.
  const boardRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorsRef = useRef<Colors>({ ...FALLBACK_COLORS });
  const cellRef = useRef(0);
  const boardSizeRef = useRef(0);
  const pointerStartRef = useRef<Cell | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = boardSizeRef.current;
    const cell = cellRef.current;
    if (size <= 0 || cell <= 0) return;
    const colors = colorsRef.current;

    ctx.fillStyle = colors.board;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = colors.grid;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < COLS; i += 1) {
      const p = i * cell;
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
    }
    for (let j = 1; j < ROWS; j += 1) {
      const p = j * cell;
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    const food = foodRef.current;
    if (food) {
      const fx = food.x * cell + cell / 2;
      const fy = food.y * cell + cell / 2;
      const r = cell * 0.32;
      ctx.fillStyle = colors.food;
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(fx - r * 0.3, fy - r * 0.3, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }

    const snake = snakeRef.current;
    const n = snake.length;
    for (let i = n - 1; i >= 0; i -= 1) {
      const t = n <= 1 ? 0 : i / (n - 1);
      const color = i === 0 ? colors.snakeHead : mixColor(colors.snake, colors.snakeTail, t);
      drawSegment(ctx, snake[i], cell, color);
      if (i === 0) {
        drawEyes(ctx, snake[i], cell, dirRef.current);
      }
    }
  }, []);

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = boardRef.current;
    if (!canvas || !wrap) return;

    // Snap the board down to a whole number of cells so each cell is an integer
    // count of CSS px — this avoids fractional grid lines / blurry cells. At the
    // 360px max footprint a 9-cell board yields crisp 40px cells.
    const available = Math.max(MIN_BOARD, Math.min(wrap.clientWidth || MAX_BOARD, MAX_BOARD));
    const cell = Math.max(1, Math.floor(available / COLS));
    const cssSize = cell * COLS;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    colorsRef.current = {
      board: readVar(wrap, '--surface', FALLBACK_COLORS.board),
      grid: readVar(wrap, '--line', FALLBACK_COLORS.grid),
      snake: readVar(wrap, '--brand', FALLBACK_COLORS.snake),
      snakeHead: readVar(wrap, '--brand-strong', FALLBACK_COLORS.snakeHead),
      snakeTail: readVar(wrap, '--brand-bright', FALLBACK_COLORS.snakeTail),
      food: readVar(wrap, '--accent', FALLBACK_COLORS.food),
    };

    cellRef.current = cell;
    boardSizeRef.current = cssSize;
    draw();
  }, [draw]);

  const placeFood = useCallback(() => {
    foodRef.current = pickFood(snakeRef.current);
  }, []);

  const resetGame = useCallback(() => {
    snakeRef.current = initialSnake();
    dirRef.current = { x: 1, y: 0 };
    dirQueueRef.current = [];
    scoreRef.current = 0;
    setScore(0);
    overRef.current = false;
    // Start parked: the snake holds still on its spawn cells (no ticks advance
    // it, so no wall/self collision is possible) until the first arrow key.
    runningRef.current = false;
    waitingRef.current = true;
    setWaiting(true);
    // Deterministic first food on every fresh game (random placement resumes
    // after each eat via placeFood in step).
    foodRef.current = initialFood();
  }, []);

  const endGame = useCallback(() => {
    if (overRef.current) return;
    overRef.current = true;
    runningRef.current = false;
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    draw();
    // Impact cue on the fatal hit (wall or self), right before the shell ends
    // the run. endGame only runs on a collision, so this never double-fires.
    sound.playEffect('crash');
    onGameOverRef.current();
  }, [draw, sound]);

  const step = useCallback(() => {
    if (!runningRef.current) return;

    const queue = dirQueueRef.current;
    if (queue.length > 0) {
      dirRef.current = queue.shift() as Cell;
    }
    const dir = dirRef.current;
    const snake = snakeRef.current;
    const head = snake[0];
    const nx = head.x + dir.x;
    const ny = head.y + dir.y;

    // Wall collision ends the run.
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
      endGame();
      return;
    }

    const food = foodRef.current;
    const willEat = !!food && food.x === nx && food.y === ny;

    // Self collision: the tail vacates its cell this tick unless we're growing.
    const limit = willEat ? snake.length : snake.length - 1;
    for (let i = 0; i < limit; i += 1) {
      if (snake[i].x === nx && snake[i].y === ny) {
        endGame();
        return;
      }
    }

    snake.unshift({ x: nx, y: ny });
    if (willEat) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      onScoreChangeRef.current(scoreRef.current);
      // Crunch on every pickup; every SCORE_MILESTONE-th one escalates to the
      // brighter level-up fanfare instead of the plain point blip.
      sound.playEffect(scoreRef.current % SCORE_MILESTONE === 0 ? 'levelUp' : 'point');
      placeFood();
    } else {
      snake.pop();
    }
    draw();
  }, [draw, endGame, placeFood, sound]);

  const handleDirection = useCallback(
    (dx: number, dy: number) => {
      // Opening move: while parked, the first directional input launches the
      // snake in that direction. Ignore a press straight back along its body
      // (180° from the spawn facing) so the very first move can't be an instant
      // self-collision; any other direction is accepted and starts the run.
      if (waitingRef.current) {
        if (dx === -dirRef.current.x && dy === -dirRef.current.y) return;
        dirRef.current = { x: dx, y: dy };
        dirQueueRef.current = [];
        waitingRef.current = false;
        runningRef.current = true;
        setWaiting(false);
        sound.playEffect('move');
        return;
      }
      if (!runningRef.current) return;
      const queue = dirQueueRef.current;
      const ref = queue.length > 0 ? queue[queue.length - 1] : dirRef.current;
      if (dx === ref.x && dy === ref.y) return; // no-op
      if (dx === -ref.x && dy === -ref.y) return; // block instant 180° reversal
      if (queue.length >= 2) return; // keep at most a small look-ahead buffer
      queue.push({ x: dx, y: dy });
      // Subtle steering tick. The guards above mean this only fires on a real,
      // newly committed turn — never on no-ops, reversals, or every tick.
      sound.playEffect('move');
    },
    [sound],
  );

  const press = useCallback(
    (dx: number, dy: number) => {
      handleDirection(dx, dy);
      boardRef.current?.focus({ preventScroll: true });
    },
    [handleDirection],
  );

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    boardRef.current?.focus({ preventScroll: true });
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        handleDirection(dx > 0 ? 1 : -1, 0);
      } else {
        handleDirection(0, dy > 0 ? 1 : -1);
      }
    },
    [handleDirection],
  );

  const onPointerEnd = useCallback(() => {
    pointerStartRef.current = null;
  }, []);

  // Keep the canvas sized to its container and crisp on HiDPI screens.
  useEffect(() => {
    sizeCanvas();
    const wrap = boardRef.current;
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && wrap) {
      observer = new ResizeObserver(() => sizeCanvas());
      observer.observe(wrap);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', sizeCanvas);
    }
    return () => {
      if (observer) {
        observer.disconnect();
      } else if (typeof window !== 'undefined') {
        window.removeEventListener('resize', sizeCanvas);
      }
    };
  }, [sizeCanvas]);

  // The loop runs ONLY while active: fresh game on activate, full stop + cleanup
  // on deactivate/unmount.
  useEffect(() => {
    if (!active) {
      runningRef.current = false;
      waitingRef.current = false;
      setWaiting(false);
      draw();
      return;
    }

    resetGame();
    onScoreChangeRef.current(0);
    sizeCanvas();
    boardRef.current?.focus({ preventScroll: true });

    const id = window.setInterval(step, TICK_MS);
    intervalRef.current = id;
    return () => {
      window.clearInterval(id);
      intervalRef.current = null;
    };
  }, [active, draw, resetGame, sizeCanvas, step]);

  // Steering is bound at the window level (like the other arcade games) so the
  // keyboard works the instant a session starts, without the player having to
  // click the board first. Bound only while active; torn down on deactivate /
  // unmount so it never steers a game that isn't running.
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      let handled = true;
      switch (event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          handleDirection(0, -1);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          handleDirection(0, 1);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          handleDirection(-1, 0);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          handleDirection(1, 0);
          break;
        case ' ':
        case 'Spacebar':
          break;
        default:
          handled = false;
      }
      if (handled) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, handleDirection]);

  return (
    <div className="sw-snake-root">
      <style>{STYLES}</style>
      <div
        ref={boardRef}
        className="sw-snake-board"
        role="application"
        aria-label={`Snake game. Score ${score}.${waiting ? ' Press an arrow key to start.' : ''}`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerEnd}
      >
        <canvas ref={canvasRef} className="sw-snake-canvas" />
        {!active ? (
          <div className="sw-snake-hint" aria-hidden="true">
            <span>
              Arrow keys, WASD,
              <br />
              or swipe to steer
            </span>
          </div>
        ) : waiting ? (
          <div className="sw-snake-hint" aria-hidden="true">
            <span>
              Press an arrow key to start
              <br />
              ↑ ↓ ← → · W A S D
            </span>
          </div>
        ) : null}
      </div>

      <div className="sw-snake-dpad">
        <span className="sw-snake-key-spacer" />
        <button type="button" className="sw-snake-key" aria-label="Move up" onClick={() => press(0, -1)}>
          ▲
        </button>
        <span className="sw-snake-key-spacer" />
        <button type="button" className="sw-snake-key" aria-label="Move left" onClick={() => press(-1, 0)}>
          ◀
        </button>
        <span className="sw-snake-key-spacer" />
        <button type="button" className="sw-snake-key" aria-label="Move right" onClick={() => press(1, 0)}>
          ▶
        </button>
        <span className="sw-snake-key-spacer" />
        <button type="button" className="sw-snake-key" aria-label="Move down" onClick={() => press(0, 1)}>
          ▼
        </button>
        <span className="sw-snake-key-spacer" />
      </div>
    </div>
  );
}
