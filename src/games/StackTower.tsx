import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useGameSound } from './useGameSound';

export type GameProps = {
  // true while the paid session timer is running. Start the game loop when this
  // becomes true; STOP/freeze and clean up (cancel rAF/intervals) when it becomes false.
  active: boolean;
  // report the player's current score whenever it changes (shell shows it live + tracks high score).
  onScoreChange: (score: number) => void;
  // call when the player loses BEFORE time runs out (shell ends the session early).
  onGameOver: () => void;
};

// Logical play-area resolution. The canvas bitmap is sized up by devicePixelRatio
// for crispness, while CSS scales it down responsively (aspect ratio preserved).
const W = 300;
const H = 460;
const BLOCK_H = 26;
const BASE_W = 150;
const FLOOR = H - 22; // y of the base block's bottom edge
const TOP_LIMIT = 60; // active block never rises above this; tower scrolls instead
export const BASE_SPEED = 100; // px/s
export const SPEED_STEP = 7; // px/s gained per successful stack
export const MAX_SPEED = 380;
const PERFECT_TOL = 4; // px: near-perfect drops snap without shrinking
const GRAVITY = 1100; // px/s^2 for trimmed debris

// Horizontal speed of the moving block at a given score. Ramps up as the tower
// grows so later levels stay challenging, capped so it never becomes unfair.
export function speedForScore(score: number): number {
  return Math.min(MAX_SPEED, BASE_SPEED + score * SPEED_STEP);
}

type Block = { x: number; w: number };
type ActiveBlock = { x: number; w: number; dir: number };
type Debris = { x: number; y: number; w: number; h: number; vx: number; vy: number; life: number; color: string };

// Greens derived from the brand palette, gently varied per level so the tower
// reads as a pleasing gradient while staying on-brand.
function blockColor(level: number): string {
  const hue = 158 + Math.sin(level * 0.35) * 16;
  const light = 38 + (level % 5) * 3;
  return `hsl(${hue.toFixed(1)}, 62%, ${light}%)`;
}

function paintBackground(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#e4f3ea'); // --brand-tint
  g.addColorStop(1, '#fffdf8'); // --surface
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  yTop: number,
  w: number,
  color: string,
  isActive: boolean,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, yTop, w, BLOCK_H);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.fillRect(x, yTop + BLOCK_H - 3, w, 3);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(x, yTop, w, 2);
  if (isActive) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, yTop + 0.75, w - 1.5, BLOCK_H - 1.5);
  }
}

// Idle frame shown whenever the session is not running (before the first play,
// between rounds). No Play/timer/score chrome — the shell owns all of that.
function drawIdle(ctx: CanvasRenderingContext2D): void {
  paintBackground(ctx);
  for (let i = 0; i < 3; i += 1) {
    const yTop = FLOOR - (i + 1) * BLOCK_H;
    ctx.fillStyle = `hsla(158, 55%, 42%, ${0.28 - i * 0.06})`;
    ctx.fillRect((W - BASE_W) / 2, yTop, BASE_W, BLOCK_H);
  }
}

export function StackTower(props: GameProps) {
  const { active, onScoreChange, onGameOver } = props;

  // Driving "tense" loop plays for the whole live session (started/stopped by
  // the helper off `active`); placement, perfect-stack and topple cues fire on
  // the events below. The handle is stable, so using it in callbacks/effects
  // never restarts the game loop.
  const sound = useGameSound(active, 'tower');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const rafRef = useRef<number | null>(null);

  // Keep the latest callbacks in refs so the game loop (which only depends on
  // `active`) never restarts just because the parent re-rendered new callbacks.
  const onScoreRef = useRef(onScoreChange);
  const onOverRef = useRef(onGameOver);
  useEffect(() => {
    onScoreRef.current = onScoreChange;
  }, [onScoreChange]);
  useEffect(() => {
    onOverRef.current = onGameOver;
  }, [onGameOver]);

  // Mutable game state (refs avoid re-renders on every animation frame).
  const placedRef = useRef<Block[]>([]);
  const activeBlockRef = useRef<ActiveBlock | null>(null);
  const debrisRef = useRef<Debris[]>([]);
  const camRef = useRef(0);
  const scoreRef = useRef(0);
  const speedRef = useRef(BASE_SPEED);
  const overRef = useRef(false);
  const startedRef = useRef(false);
  const lastTimeRef = useRef(0);
  // Consecutive near-perfect drops — drives the rising pitch + level-up cue.
  const perfectStreakRef = useRef(0);

  const handleDrop = useCallback(() => {
    if (overRef.current) {
      return;
    }
    const moving = activeBlockRef.current;
    const placed = placedRef.current;
    if (!moving || placed.length === 0) {
      return;
    }

    const below = placed[placed.length - 1];
    const left = Math.max(moving.x, below.x);
    const right = Math.min(moving.x + moving.w, below.x + below.w);
    const overlap = right - left;

    if (overlap <= 0) {
      // Complete miss — no overlap with the block below: the run is over.
      overRef.current = true;
      activeBlockRef.current = null;
      perfectStreakRef.current = 0;
      sound.playEffect('crash'); // impact cue right before the shell ends the run
      onOverRef.current();
      return;
    }

    const placedCount = placed.length;
    const movingScreenTop = FLOOR - (placedCount + 1) * BLOCK_H + camRef.current;
    const movingColor = blockColor(placedCount);

    let newX = left;
    let newW = overlap;
    let perfect = false;

    if (Math.abs(moving.x - below.x) <= PERFECT_TOL) {
      // Near-perfect alignment: snap and keep the full width (classic reward).
      perfect = true;
      newX = below.x;
      newW = below.w;
    } else {
      // Trim the overhang and send the sliver(s) tumbling for a little juice.
      if (moving.x < below.x) {
        debrisRef.current.push({
          x: moving.x,
          y: movingScreenTop,
          w: below.x - moving.x,
          h: BLOCK_H,
          vx: -(60 + Math.random() * 40),
          vy: -30,
          life: 1,
          color: movingColor,
        });
      }
      const movingRight = moving.x + moving.w;
      const belowRight = below.x + below.w;
      if (movingRight > belowRight) {
        debrisRef.current.push({
          x: belowRight,
          y: movingScreenTop,
          w: movingRight - belowRight,
          h: BLOCK_H,
          vx: 60 + Math.random() * 40,
          vy: -30,
          life: 1,
          color: movingColor,
        });
      }
    }

    placed.push({ x: newX, w: newW });
    scoreRef.current += 1;
    onScoreRef.current(scoreRef.current);
    speedRef.current = speedForScore(scoreRef.current);
    startedRef.current = true;

    if (perfect) {
      // Reward a clean stack: a bright "point", a chirp that climbs a semitone
      // per consecutive perfect, and a level-up flourish every fifth in a row.
      perfectStreakRef.current += 1;
      const streak = perfectStreakRef.current;
      sound.playEffect('point');
      const freq = 523.25 * 2 ** (Math.min(streak - 1, 24) / 12); // C5 and up
      sound.playCustom({ freq, type: 'triangle', duration: 0.14, gain: 0.4, sweepTo: freq * 1.5 });
      if (streak % 5 === 0) {
        sound.playEffect('levelUp');
      }
    } else {
      // A trimmed drop just thuds into place and breaks any perfect streak.
      perfectStreakRef.current = 0;
      sound.playEffect('land');
    }

    // Spawn the next block at a wall, matching the new (possibly trimmed) width.
    const fromLeft = Math.random() < 0.5;
    activeBlockRef.current = {
      x: fromLeft ? 0 : W - newW,
      w: newW,
      dir: fromLeft ? 1 : -1,
    };
  }, [sound]);

  // One-time canvas bitmap setup (DPR scaling) + initial idle paint.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctxRef.current = ctx;
    drawIdle(ctx);
  }, []);

  // The game loop runs ONLY while `active`. A fresh tower is built every time
  // `active` flips to true; everything is torn down when it flips to false.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) {
      return;
    }

    if (!active) {
      drawIdle(ctx);
      return;
    }

    // Fresh run.
    placedRef.current = [{ x: (W - BASE_W) / 2, w: BASE_W }];
    activeBlockRef.current = { x: 0, w: BASE_W, dir: 1 };
    debrisRef.current = [];
    camRef.current = 0;
    scoreRef.current = 0;
    speedRef.current = BASE_SPEED;
    overRef.current = false;
    startedRef.current = false;
    perfectStreakRef.current = 0;
    lastTimeRef.current = performance.now();
    onScoreRef.current(0);
    containerRef.current?.focus({ preventScroll: true });
    sound.playEffect('gameStart'); // short ramp as the live session kicks off

    const update = (dt: number) => {
      const placedCount = placedRef.current.length;
      const camTarget = Math.max(0, TOP_LIMIT - FLOOR + (placedCount + 1) * BLOCK_H);
      camRef.current += (camTarget - camRef.current) * Math.min(1, dt * 10);

      const moving = activeBlockRef.current;
      if (moving && !overRef.current) {
        moving.x += moving.dir * speedRef.current * dt;
        if (moving.x <= 0) {
          moving.x = 0;
          moving.dir = 1;
        }
        const maxX = W - moving.w;
        if (moving.x >= maxX) {
          moving.x = maxX;
          moving.dir = -1;
        }
      }

      const debris = debrisRef.current;
      for (let i = debris.length - 1; i >= 0; i -= 1) {
        const d = debris[i];
        d.vy += GRAVITY * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.life -= dt * 1.1;
        if (d.life <= 0 || d.y > H + 60) {
          debris.splice(i, 1);
        }
      }
    };

    const draw = () => {
      paintBackground(ctx);
      const placed = placedRef.current;
      const cam = camRef.current;

      for (let i = 0; i < placed.length; i += 1) {
        const yTop = FLOOR - (i + 1) * BLOCK_H + cam;
        if (yTop > H || yTop + BLOCK_H < 0) {
          continue;
        }
        drawBlock(ctx, placed[i].x, yTop, placed[i].w, blockColor(i), false);
      }

      const moving = activeBlockRef.current;
      if (moving) {
        const yTop = FLOOR - (placed.length + 1) * BLOCK_H + cam;
        drawBlock(ctx, moving.x, yTop, moving.w, blockColor(placed.length), true);
      }

      const debris = debrisRef.current;
      for (let i = 0; i < debris.length; i += 1) {
        const d = debris[i];
        ctx.globalAlpha = Math.max(0, Math.min(1, d.life));
        ctx.fillStyle = d.color;
        ctx.fillRect(d.x, d.y, d.w, d.h);
      }
      ctx.globalAlpha = 1;

      if (!startedRef.current) {
        ctx.fillStyle = 'rgba(20, 33, 46, 0.5)';
        ctx.font = '600 13px ui-sans-serif, system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Tap or press Space to drop', W / 2, 34);
        ctx.textAlign = 'start';
      }
    };

    const step = (now: number) => {
      let dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      if (dt > 0.05) {
        dt = 0.05; // clamp after tab-away so nothing teleports
      }
      update(dt);
      draw();
      rafRef.current = requestAnimationFrame(step);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) {
        return;
      }
      if (e.code === 'Space' || e.key === ' ' || e.code === 'ArrowDown' || e.code === 'Enter' || e.key === 'Enter') {
        e.preventDefault();
        handleDrop();
      }
    };

    rafRef.current = requestAnimationFrame(step);
    window.addEventListener('keydown', onKey, { passive: false });

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      window.removeEventListener('keydown', onKey);
    };
  }, [active, handleDrop, sound]);

  return (
    <div style={{ width: '100%', maxWidth: W, margin: '0 auto', userSelect: 'none' }}>
      <div
        ref={containerRef}
        role="application"
        aria-label="Stack tower"
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          handleDrop();
        }}
        style={{
          position: 'relative',
          borderRadius: 16,
          overflow: 'hidden',
          cursor: 'pointer',
          touchAction: 'none',
          background: 'var(--surface)',
          boxShadow: '0 10px 30px rgba(11, 94, 63, 0.18)',
        }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          style={{ display: 'block', width: '100%', height: 'auto' }}
        />
      </div>
    </div>
  );
}
