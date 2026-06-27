// Flappy (id: flappy-bird): a self-contained React + Canvas minigame. Runs the
// loop only while `active`, reports score via `onScoreChange`, and signals a loss
// with `onGameOver`; the shell owns all billing/timer/high-score chrome.

import { useEffect, useRef } from 'react';
// `React.JSX.Element` is the React 19 spelling of the contract's `JSX.Element`
// (this project's @types/react has no global JSX). Type-only, erased at build.
import type * as React from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useGameSound } from './useGameSound';

// The shared game contract, re-declared locally so this file stays independent
// of the registry/shell.
type GameProps = {
  active: boolean;
  onScoreChange: (score: number) => void;
  onGameOver: () => void;
};

// ---- Fixed-resolution play field (CSS scales it down responsively) ----
const WIDTH = 400;
const HEIGHT = 600;
const GROUND_H = 92;
const GROUND_Y = HEIGHT - GROUND_H;

// ---- Bird ----
const BIRD_X = 108;
const BIRD_R = 15;
const GRAVITY = 1500; // px/s^2
const FLAP_V = -440; // px/s velocity set on each flap
const MAX_FALL = 640; // terminal velocity keeps the fall controllable

// ---- Pipes ----
const PIPE_W = 66;
const PIPE_SPACING = 232; // horizontal distance between consecutive pipe pairs
const GAP_BASE = 170;
const GAP_MIN = 132;
const GAP_MARGIN = 56; // keep gaps off the ceiling/ground
const BASE_SPEED = 152; // px/s scroll speed at the start
const SPEED_PER_SCORE = 6; // ramps difficulty as the score climbs
const SPEED_PER_SEC = 3.2; // ...and a gentle ramp over time
const MAX_SPEED = 380;

type Pipe = { x: number; gapTop: number; gap: number; scored: boolean };

type GameState = {
  birdY: number;
  birdV: number;
  rotation: number;
  pipes: Pipe[];
  score: number;
  elapsed: number; // total seconds the loop has run (drives idle animation)
  runTime: number; // seconds since the first flap (drives the speed ramp)
  groundScroll: number; // px the ground texture has scrolled
  spawnDist: number; // px travelled since the last pipe spawn
  started: boolean; // becomes true on the first flap
  over: boolean;
  lastTime: number; // rAF timestamp of the previous frame (ms)
};

type Palette = {
  skyTop: string;
  skyBottom: string;
  hill: string;
  pipe: string;
  pipeLight: string;
  pipeDark: string;
  bird: string;
  birdLight: string;
  birdWing: string;
  beak: string;
  ground: string;
  grass: string;
  grassDark: string;
  groundDash: string;
  ink: string;
  inkSoft: string;
  white: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function makeState(): GameState {
  return {
    birdY: HEIGHT * 0.42,
    birdV: 0,
    rotation: 0,
    pipes: [],
    score: 0,
    elapsed: 0,
    runTime: 0,
    groundScroll: 0,
    spawnDist: 0,
    started: false,
    over: false,
    lastTime: 0,
  };
}

function currentSpeed(s: GameState): number {
  return Math.min(MAX_SPEED, BASE_SPEED + s.score * SPEED_PER_SCORE + s.runTime * SPEED_PER_SEC);
}

function spawnPipe(s: GameState): void {
  const gap = Math.max(GAP_MIN, GAP_BASE - s.score * 3);
  const minTop = GAP_MARGIN;
  const maxTop = GROUND_Y - gap - GAP_MARGIN;
  const gapTop = minTop + Math.random() * Math.max(0, maxTop - minTop);
  s.pipes.push({ x: WIDTH + 20, gapTop, gap, scored: false });
}

// Returns true when the flap actually registered (so the caller can fire the
// jump cue), and false when the bird is already down and input is ignored.
function applyFlap(s: GameState): boolean {
  if (s.over) return false;
  if (!s.started) {
    s.started = true;
    s.spawnDist = 0;
    spawnPipe(s);
  }
  s.birdV = FLAP_V;
  return true;
}

function circleHitsRect(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// Advance the simulation by dt seconds. Returns the number of pipes newly
// cleared this tick (so the caller can report score) and flips `over` on any
// fatal collision (pipe, ground, or ceiling).
function update(s: GameState, dt: number): number {
  s.elapsed += dt;

  // Idle "ready" bob before the first flap: no gravity, no pipes moving, so the
  // run only begins once the player acts.
  if (!s.started) {
    s.birdY = HEIGHT * 0.42 + Math.sin(s.elapsed * 3) * 7;
    s.birdV = 0;
    s.rotation = 0;
    return 0;
  }
  if (s.over) return 0;

  s.runTime += dt;

  // Bird physics.
  s.birdV = Math.min(MAX_FALL, s.birdV + GRAVITY * dt);
  s.birdY += s.birdV * dt;
  s.rotation = clamp(s.birdV / 520, -0.5, 1.45);

  // Scroll the world right-to-left at the (increasing) current speed.
  const dx = currentSpeed(s) * dt;
  s.groundScroll += dx;
  for (const p of s.pipes) p.x -= dx;
  s.spawnDist += dx;
  if (s.spawnDist >= PIPE_SPACING) {
    s.spawnDist -= PIPE_SPACING;
    spawnPipe(s);
  }
  if (s.pipes.length > 0 && s.pipes[0].x + PIPE_W < -8) s.pipes.shift();

  // Score a pipe once its trailing edge passes the bird.
  let gained = 0;
  for (const p of s.pipes) {
    if (!p.scored && p.x + PIPE_W < BIRD_X) {
      p.scored = true;
      s.score += 1;
      gained += 1;
    }
  }

  // Collisions: ground, ceiling, then each pipe.
  if (s.birdY + BIRD_R >= GROUND_Y) {
    s.birdY = GROUND_Y - BIRD_R;
    s.over = true;
    return gained;
  }
  if (s.birdY - BIRD_R <= 0) {
    s.birdY = BIRD_R;
    s.over = true;
    return gained;
  }
  for (const p of s.pipes) {
    const bottomY = p.gapTop + p.gap;
    if (
      circleHitsRect(BIRD_X, s.birdY, BIRD_R, p.x, 0, PIPE_W, p.gapTop) ||
      circleHitsRect(BIRD_X, s.birdY, BIRD_R, p.x, bottomY, PIPE_W, GROUND_Y - bottomY)
    ) {
      s.over = true;
      break;
    }
  }
  return gained;
}

function readPalette(): Palette {
  let css: CSSStyleDeclaration | null = null;
  try {
    css = getComputedStyle(document.documentElement);
  } catch {
    css = null;
  }
  const v = (name: string, fallback: string): string => {
    const got = css?.getPropertyValue(name)?.trim();
    return got ? got : fallback;
  };

  const brand = v('--brand', '#11815a');
  const brandStrong = v('--brand-strong', '#0c6443');
  const brandBright = v('--brand-bright', '#2fd27f');
  const brandTint = v('--brand-tint', '#e4f3ea');
  const warn = v('--warn', '#f5b13d');
  const accent = v('--accent', '#ff5a4d');
  const ink = v('--ink', '#14212e');
  const inkSoft = v('--ink-soft', '#51606f');
  const paper = v('--paper', '#f5f2ea');
  const lineStrong = v('--line-strong', '#d7cfbe');

  return {
    skyTop: '#f3faf6',
    skyBottom: brandTint,
    hill: 'rgba(47, 210, 127, 0.16)',
    pipe: brand,
    pipeLight: brandBright,
    pipeDark: brandStrong,
    bird: warn,
    birdLight: '#ffd98a',
    birdWing: '#e59a25',
    beak: accent,
    ground: paper,
    grass: brand,
    grassDark: brandStrong,
    groundDash: lineStrong,
    ink,
    inkSoft,
    white: '#ffffff',
  };
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

function drawPipe(ctx: CanvasRenderingContext2D, pipe: Pipe, p: Palette): void {
  const x = pipe.x;
  const topH = pipe.gapTop;
  const bottomY = pipe.gapTop + pipe.gap;
  const bottomH = GROUND_Y - bottomY;
  const capH = 26;
  const capOver = 5;

  // Bodies.
  ctx.fillStyle = p.pipe;
  ctx.fillRect(x, 0, PIPE_W, topH);
  ctx.fillRect(x, bottomY, PIPE_W, bottomH);

  // Light highlight on the left, dark edge on the right, for a tube look.
  ctx.fillStyle = p.pipeLight;
  ctx.fillRect(x + 7, 0, 7, topH);
  ctx.fillRect(x + 7, bottomY, 7, bottomH);
  ctx.fillStyle = p.pipeDark;
  ctx.fillRect(x + PIPE_W - 9, 0, 9, topH);
  ctx.fillRect(x + PIPE_W - 9, bottomY, 9, bottomH);

  // Rounded lip caps framing the gap.
  ctx.fillStyle = p.pipe;
  roundRectPath(ctx, x - capOver, topH - capH, PIPE_W + capOver * 2, capH, 7);
  ctx.fill();
  roundRectPath(ctx, x - capOver, bottomY, PIPE_W + capOver * 2, capH, 7);
  ctx.fill();
  ctx.fillStyle = p.pipeDark;
  ctx.fillRect(x - capOver, topH - 4, PIPE_W + capOver * 2, 4);
  ctx.fillRect(x - capOver, bottomY + capH - 4, PIPE_W + capOver * 2, 4);
}

function drawGround(ctx: CanvasRenderingContext2D, s: GameState, p: Palette): void {
  ctx.fillStyle = p.ground;
  ctx.fillRect(0, GROUND_Y, WIDTH, GROUND_H);
  ctx.fillStyle = p.grass;
  ctx.fillRect(0, GROUND_Y, WIDTH, 14);
  ctx.fillStyle = p.grassDark;
  ctx.fillRect(0, GROUND_Y + 14, WIDTH, 4);

  // Scrolling dashes imply forward motion.
  const offset = s.groundScroll % 28;
  ctx.fillStyle = p.groundDash;
  for (let gx = -offset; gx < WIDTH; gx += 28) {
    ctx.fillRect(gx, GROUND_Y + 30, 16, 6);
  }
}

function drawBird(ctx: CanvasRenderingContext2D, s: GameState, p: Palette): void {
  ctx.save();
  ctx.translate(BIRD_X, s.birdY);
  ctx.rotate(s.rotation);

  // Body.
  ctx.fillStyle = p.bird;
  ctx.beginPath();
  ctx.ellipse(0, 0, BIRD_R + 3, BIRD_R, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly highlight.
  ctx.fillStyle = p.birdLight;
  ctx.beginPath();
  ctx.ellipse(-2, 3, BIRD_R - 3, BIRD_R - 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wing flaps while flying, gently bobs while idle.
  const wing = s.started ? Math.sin(s.elapsed * 18) * 4 : Math.sin(s.elapsed * 6) * 2;
  ctx.fillStyle = p.birdWing;
  ctx.beginPath();
  ctx.ellipse(-4, 2 + wing, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eye.
  ctx.fillStyle = p.white;
  ctx.beginPath();
  ctx.arc(7, -5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(9, -5, 2.4, 0, Math.PI * 2);
  ctx.fill();

  // Beak.
  ctx.fillStyle = p.beak;
  ctx.beginPath();
  ctx.moveTo(BIRD_R + 1, -2);
  ctx.lineTo(BIRD_R + 11, 1);
  ctx.lineTo(BIRD_R + 1, 5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawScene(ctx: CanvasRenderingContext2D, s: GameState, p: Palette, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Sky.
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, p.skyTop);
  sky.addColorStop(1, p.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Decorative rolling hills behind the pipes.
  ctx.fillStyle = p.hill;
  ctx.beginPath();
  ctx.ellipse(WIDTH * 0.28, GROUND_Y + 8, 150, 80, 0, 0, Math.PI * 2);
  ctx.ellipse(WIDTH * 0.78, GROUND_Y + 14, 130, 70, 0, 0, Math.PI * 2);
  ctx.fill();

  for (const pipe of s.pipes) drawPipe(ctx, pipe, p);

  drawGround(ctx, s, p);
  drawBird(ctx, s, p);

  // Score, or the start hint before the first flap.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (s.started) {
    ctx.lineWidth = 5;
    ctx.strokeStyle = p.ink;
    ctx.fillStyle = p.white;
    ctx.font = '700 46px Inter, system-ui, sans-serif';
    ctx.strokeText(String(s.score), WIDTH / 2, 72);
    ctx.fillText(String(s.score), WIDTH / 2, 72);
  } else {
    ctx.fillStyle = p.inkSoft;
    ctx.font = '700 19px Inter, system-ui, sans-serif';
    ctx.fillText('Tap or press Space to flap', WIDTH / 2, HEIGHT * 0.3);
  }

  // Brief dim on the final frame; the shell renders the real game-over panel.
  if (s.over) {
    ctx.fillStyle = 'rgba(20, 33, 46, 0.18)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}

export function FlappyBird({ active, onScoreChange, onGameOver }: GameProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>(makeState());

  // Stable handle, safe to call from the rAF loop and the key/pointer handlers.
  const sound = useGameSound(active, 'flappy');

  // Keep the latest callbacks in refs so the rAF loop never needs to restart
  // when the parent re-renders (it re-renders every timer tick).
  const onScoreChangeRef = useRef(onScoreChange);
  const onGameOverRef = useRef(onGameOver);
  onScoreChangeRef.current = onScoreChange;
  onGameOverRef.current = onGameOver;

  useEffect(() => {
    if (!active) return;

    // Fresh game every time the session (re)starts.
    const state = makeState();
    stateRef.current = state;
    onScoreChangeRef.current(0);
    // A short fanfare as the paid run begins (the looping track is handled by
    // the helper above).
    sound.playEffect('gameStart');

    const canvas = canvasRef.current;
    let ctx: CanvasRenderingContext2D | null = null;
    let dpr = 1;
    if (canvas) {
      dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      canvas.width = WIDTH * dpr;
      canvas.height = HEIGHT * dpr;
      try {
        ctx = canvas.getContext('2d');
      } catch {
        ctx = null;
      }
      // Focus the play area so the focus ring marks it, without scrolling to it.
      canvas.focus({ preventScroll: true });
    }
    const palette = readPalette();

    let raf = 0;
    let running = true;
    let overSignaled = false;

    const step = (now: number): void => {
      if (!running) return;
      const s = stateRef.current;
      if (s.lastTime === 0) s.lastTime = now;
      let dt = (now - s.lastTime) / 1000;
      s.lastTime = now;
      // Clamp dt so an inactive/background tab can't teleport the bird.
      dt = clamp(dt, 0, 1 / 30);

      const gained = update(s, dt);
      if (gained > 0) {
        onScoreChangeRef.current(s.score);
      }
      if (ctx) drawScene(ctx, s, palette, dpr);

      if (s.over) {
        running = false;
        if (!overSignaled) {
          overSignaled = true;
          // Impact cue first, then hand the loss up to the shell.
          sound.playEffect('crash');
          onGameOverRef.current();
        }
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code === 'Space' || e.key === ' ' || e.key === 'ArrowUp' || e.key === 'Up') {
        // Stop the page from scrolling while the game owns these keys.
        e.preventDefault();
        if (!e.repeat && applyFlap(stateRef.current)) sound.playEffect('jump');
      }
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [active, sound]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!active) return;
    e.preventDefault();
    canvasRef.current?.focus({ preventScroll: true });
    if (applyFlap(stateRef.current)) sound.playEffect('jump');
  };

  return (
    <div style={{ display: 'grid', placeItems: 'center', width: '100%' }}>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        onPointerDown={handlePointerDown}
        tabIndex={0}
        role="application"
        aria-label="Flappy minigame. Tap, or press Space or Arrow Up, to flap the bird through the gaps in the pipes."
        style={{
          width: '100%',
          maxWidth: WIDTH,
          height: 'auto',
          aspectRatio: `${WIDTH} / ${HEIGHT}`,
          display: 'block',
          borderRadius: 'var(--r-lg, 24px)',
          boxShadow: 'var(--shadow-md, 0 16px 44px rgba(20, 33, 46, 0.09))',
          background: 'var(--brand-tint, #e4f3ea)',
          touchAction: 'none',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      />
    </div>
  );
}
