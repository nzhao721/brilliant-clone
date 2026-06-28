// Dino Run (id: dino-run): a self-contained React + Canvas endless runner. Jump
// over ground obstacles, duck under flyers; a collision ends the run. Implements
// the shared GameProps contract; the shell owns all billing/timer/score chrome.

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useGameSound } from './useGameSound';

// Shared game contract, re-declared locally so this file imports nothing shared.
type GameProps = {
  active: boolean;
  onScoreChange: (score: number) => void;
  onGameOver: () => void;
};

// --- World constants ---------------------------------------------------------
const WIDTH = 760;
const HEIGHT = 260;
const GROUND_Y = 212;

const DINO_X = 96;
const DINO_W = 38;
const DINO_H = 46;
const DUCK_W = 56;
const DUCK_H = 26;

// Collision boxes are inset a touch so near-misses feel fair.
const DINO_INSET_X = 7;
const DINO_INSET_Y = 5;
const OBS_INSET = 3;

const GRAVITY = 0.86;
const JUMP_VELOCITY = 14.2;
const FASTFALL_MULT = 2.5;
const MAX_FALL = 24;

export const BASE_SPEED = 5.2;
export const MAX_SPEED = 13.4;
export const SPEED_RAMP = 0.00046;

const SCORE_DIV = 18;

const INITIAL_SPAWN_DELAY = 70; // frames of grace before the first obstacle
const WARMUP_DIST = 1600; // flyers only appear after this much distance
const RAMP_GAP = 16000; // distance over which spawn gaps tighten to their floor
export const GAP_MIN_START = 60;
export const GAP_MIN_END = 42;
export const GAP_MAX_START = 104;
export const GAP_MAX_END = 68;

// --- Playability guard -------------------------------------------------------
// A jump keeps the runner aloft for ~JUMP_AIRTIME frames and it cannot jump
// again until it lands, so two obstacles must be at least that far apart *in
// time* for both to be clearable. Spawn gaps are counted in frames and every
// obstacle scrolls at the current `speed`, so this frame floor maps to a
// horizontal clearance of `speed * MIN_SPAWN_GAP` px — the real (pixel) min gap
// therefore scales up automatically as the world speeds up. GAP_SAFETY adds a
// little landing + reaction headroom on top of the raw airtime.
export const JUMP_AIRTIME = (2 * JUMP_VELOCITY) / GRAVITY; // ~33 frames per arc
const GAP_SAFETY = 1.18;
export const MIN_SPAWN_GAP = JUMP_AIRTIME * GAP_SAFETY; // ~39-frame hard floor

// Flyers sit at "head height": a standing runner collides, a ducking one fits
// underneath. bottom = GROUND_Y - HIGH_CLEARANCE keeps it duckable (and still
// jumpable) regardless of the standing/duck heights above.
const HIGH_CLEARANCE = 34;
const HIGH_H = 22;

const HINT_FRAMES = 220;
const RUN_CADENCE = 0.55;
const GROUND_TILE = 44;
const STEP_CLAMP = 2.5; // cap dt after a tab-switch so nothing tunnels

// --- Parallax depth ----------------------------------------------------------
// Background layers scroll at a fraction of world speed so distance reads as
// depth (ground/obstacles at full speed, layers behind slower). Hills track
// their own phase (radians) rather than groundScroll, which otherwise flung them
// across the screen at each GROUND_TILE wrap.
const TAU = Math.PI * 2;
const HILL_FAR_FREQ = 0.01; // distant ridge waveform
const HILL_MID_FREQ = 0.016; // nearer ridge waveform
const PARALLAX_HILL_FAR = 0.14; // distant ridge ~14% of world speed
const PARALLAX_HILL_MID = 0.28; // nearer ridge ~28% of world speed
const HILL_MID_PHASE_OFFSET = 2; // keep the two ridges from lining up
const CLOUD_FACTOR_MIN = 0.04; // clouds drift slowest of all (furthest layer)
const CLOUD_FACTOR_MAX = 0.1;

// --- Types -------------------------------------------------------------------
type Cloud = { x: number; y: number; scale: number; factor: number };
type Stalk = { dx: number; w: number; h: number };
type Obstacle = {
  kind: 'ground' | 'high';
  x: number;
  w: number;
  h: number;
  topY: number;
  stalks: Stalk[];
  flap: number;
};
type GameState = {
  dino: { y: number; vy: number };
  onGround: boolean;
  duckHeld: boolean;
  obstacles: Obstacle[];
  speed: number;
  distance: number;
  score: number;
  spawnTimer: number;
  tick: number;
  elapsed: number;
  groundScroll: number;
  hillFarPhase: number;
  hillMidPhase: number;
  clouds: Cloud[];
  dead: boolean;
  started: boolean;
};
type Palette = {
  brand: string;
  brandStrong: string;
  brandDeep: string;
  brandBright: string;
  brandTint: string;
  brandTintStrong: string;
  accent: string;
  accentSoft: string;
  warn: string;
  surface: string;
  surfaceSunken: string;
  line: string;
  lineStrong: string;
  ink: string;
  inkSoft: string;
};
type Box = { x: number; y: number; w: number; h: number };

// --- Small helpers -----------------------------------------------------------
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function intersects(a: Box, b: Box) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function readPalette(el: Element | null): Palette {
  const cs = el ? getComputedStyle(el) : null;
  const get = (name: string, fallback: string) => {
    const v = cs?.getPropertyValue(name).trim();
    return v ? v : fallback;
  };
  return {
    brand: get('--brand', '#11815a'),
    brandStrong: get('--brand-strong', '#0c6443'),
    brandDeep: get('--brand-deep', '#0b5e3f'),
    brandBright: get('--brand-bright', '#2fd27f'),
    brandTint: get('--brand-tint', '#e4f3ea'),
    brandTintStrong: get('--brand-tint-strong', '#d2ebdc'),
    accent: get('--accent', '#ff5a4d'),
    accentSoft: get('--accent-soft', '#ffe7e3'),
    warn: get('--warn', '#f5b13d'),
    surface: get('--surface', '#fffdf8'),
    surfaceSunken: get('--surface-sunken', '#efeadf'),
    line: get('--line', '#e7e1d4'),
    lineStrong: get('--line-strong', '#d7cfbe'),
    ink: get('--ink', '#14212e'),
    inkSoft: get('--ink-soft', '#51606f'),
  };
}

// --- Fresh game state --------------------------------------------------------
export function createState(): GameState {
  const clouds: Cloud[] = [];
  for (let i = 0; i < 3; i += 1) {
    clouds.push({
      x: rand(60, WIDTH - 40),
      y: rand(26, 96),
      scale: rand(0.7, 1.25),
      factor: rand(CLOUD_FACTOR_MIN, CLOUD_FACTOR_MAX),
    });
  }
  return {
    dino: { y: GROUND_Y, vy: 0 },
    onGround: true,
    duckHeld: false,
    obstacles: [],
    speed: BASE_SPEED,
    distance: 0,
    score: 0,
    spawnTimer: INITIAL_SPAWN_DELAY,
    tick: 0,
    elapsed: 0,
    groundScroll: 0,
    hillFarPhase: 0,
    hillMidPhase: 0,
    clouds,
    dead: false,
    started: false,
  };
}

// --- Input model (pure; shared by the component and unit tests) --------------
// Physical key CODES (not keys) so WASD works on non-QWERTY layouts and the
// arrows stay layout-independent. The two sets never overlap, so a key is only
// ever a jump OR a duck — never both.
export const JUMP_CODES = new Set(['Space', 'ArrowUp', 'KeyW']);
export const DUCK_CODES = new Set(['ArrowDown', 'KeyS']);

// Launch a jump when grounded and alive; returns true only when a jump actually
// started (so the caller can fire the jump cue). Always marks the run started so
// the on-canvas hint clears on the first input.
export function startJump(s: GameState): boolean {
  if (s.dead) return false;
  s.started = true;
  if (!s.onGround) return false;
  s.dino.vy = -JUMP_VELOCITY;
  s.onGround = false;
  return true;
}

// Hold/release the crouch. An explicit setter (not a toggle) is what makes the
// duck reliable: a missed keyup or a window blur can force it back off without
// having to guess the current state, so the crouch can never "stick" on.
export function setDuck(s: GameState, held: boolean): void {
  s.duckHeld = held;
  if (held) s.started = true;
}

// The runner only crouches while the duck key is held AND it is on the ground
// (in the air the same key triggers a fast-fall instead). Single source of truth
// for both the collision box and the drawn pose.
export function isDucking(s: GameState): boolean {
  return s.duckHeld && s.onGround;
}

// Release a held key only on a genuine tab-away (document hidden). The window
// keydown/keyup stream survives in-window focus moves, so a held crouch rides
// those out; a real tab-away is the one case a keyup can't arrive, so drop it
// there to stop the crouch sticking on.
export function releaseHeldKeysIfHidden(s: GameState, hidden: boolean): void {
  if (hidden) setDuck(s, false);
}

function pickStalkCount(t: number): number {
  const r = Math.random();
  if (t > 0.55 && r < 0.16) return 3;
  if (t > 0.28 && r < 0.42) return 2;
  return 1;
}

function spawnObstacle(s: GameState) {
  const t = clamp(s.distance / RAMP_GAP, 0, 1);
  const allowHigh = s.distance > WARMUP_DIST;
  if (allowHigh && Math.random() < 0.28) {
    const w = 38;
    const bottom = GROUND_Y - HIGH_CLEARANCE;
    s.obstacles.push({
      kind: 'high',
      x: WIDTH + 24,
      w,
      h: HIGH_H,
      topY: bottom - HIGH_H,
      stalks: [],
      flap: Math.random() * Math.PI * 2,
    });
    return;
  }

  const count = pickStalkCount(t);
  const stalks: Stalk[] = [];
  let cursor = 0;
  let maxH = 0;
  for (let i = 0; i < count; i += 1) {
    const w = Math.round(rand(14, 18));
    const h = Math.round(rand(28, 46));
    stalks.push({ dx: cursor, w, h });
    cursor += w + (i < count - 1 ? Math.round(rand(2, 5)) : 0);
    maxH = Math.max(maxH, h);
  }
  s.obstacles.push({
    kind: 'ground',
    x: WIDTH + 24,
    w: cursor,
    h: maxH,
    topY: GROUND_Y - maxH,
    stalks,
    flap: 0,
  });
}

// --- Physics / simulation (mutates state; never touches React) ---------------
function dinoBox(s: GameState): Box {
  const ducking = isDucking(s);
  const w = ducking ? DUCK_W : DINO_W;
  const h = ducking ? DUCK_H : DINO_H;
  return {
    x: DINO_X + DINO_INSET_X,
    y: s.dino.y - h + DINO_INSET_Y,
    w: w - DINO_INSET_X * 2,
    h: h - DINO_INSET_Y * 2,
  };
}

function obstacleBox(o: Obstacle): Box {
  return { x: o.x + OBS_INSET, y: o.topY + OBS_INSET, w: o.w - OBS_INSET * 2, h: o.h - OBS_INSET * 2 };
}

export function stepPhysics(s: GameState, step: number) {
  if (s.dead) return;

  s.tick += step;
  s.elapsed += step;
  s.distance += s.speed * step;
  s.speed = Math.min(MAX_SPEED, BASE_SPEED + s.distance * SPEED_RAMP);

  // Vertical motion. Holding duck while airborne triggers a faster fall.
  const g = !s.onGround && s.duckHeld ? GRAVITY * FASTFALL_MULT : GRAVITY;
  s.dino.vy = Math.min(MAX_FALL, s.dino.vy + g * step);
  s.dino.y += s.dino.vy * step;
  if (s.dino.y >= GROUND_Y) {
    s.dino.y = GROUND_Y;
    s.dino.vy = 0;
    s.onGround = true;
  } else {
    s.onGround = false;
  }

  // Spawning on a frame countdown keeps reaction time roughly constant as the
  // world speeds up (spatial gaps widen, temporal gaps stay fair).
  s.spawnTimer -= step;
  if (s.spawnTimer <= 0) {
    spawnObstacle(s);
    const t = clamp(s.distance / RAMP_GAP, 0, 1);
    const minF = lerp(GAP_MIN_START, GAP_MIN_END, t);
    const maxF = lerp(GAP_MAX_START, GAP_MAX_END, t);
    // Never let the next gap fall below the physics floor: even at the tightest
    // random draw the runner can land from clearing one obstacle before the next
    // reaches it (MIN_SPAWN_GAP > JUMP_AIRTIME, at any speed).
    s.spawnTimer = Math.max(MIN_SPAWN_GAP, rand(minF, maxF));
  }

  for (const o of s.obstacles) {
    o.x -= s.speed * step;
  }
  s.obstacles = s.obstacles.filter((o) => o.x + o.w > -24);

  s.groundScroll = (s.groundScroll + s.speed * step) % GROUND_TILE;
  // Ridges advance their own phase at a small fraction of world speed (phase in
  // radians wraps at TAU, so the sine waveform stays perfectly seamless).
  s.hillFarPhase = (s.hillFarPhase + s.speed * step * PARALLAX_HILL_FAR * HILL_FAR_FREQ) % TAU;
  s.hillMidPhase = (s.hillMidPhase + s.speed * step * PARALLAX_HILL_MID * HILL_MID_FREQ) % TAU;
  for (const c of s.clouds) {
    c.x -= s.speed * step * c.factor;
    if (c.x < -90) {
      c.x = WIDTH + rand(20, 140);
      c.y = rand(24, 96);
      c.scale = rand(0.7, 1.25);
    }
  }

  const box = dinoBox(s);
  for (const o of s.obstacles) {
    if (intersects(box, obstacleBox(o))) {
      s.dead = true;
      break;
    }
  }

  s.score = Math.floor(s.distance / SCORE_DIV);
}

// --- Rendering ---------------------------------------------------------------
function drawHillLayer(
  ctx: CanvasRenderingContext2D,
  baseY: number,
  amp: number,
  freq: number,
  phase: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  for (let x = 0; x <= WIDTH; x += 10) {
    const y = baseY - amp * (0.5 + 0.5 * Math.sin(x * freq + phase));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(WIDTH, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCloud(ctx: CanvasRenderingContext2D, c: Cloud) {
  const { x, y, scale } = c;
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 12 * scale, 0, Math.PI * 2);
  ctx.arc(x + 14 * scale, y + 4 * scale, 9 * scale, 0, Math.PI * 2);
  ctx.arc(x - 14 * scale, y + 4 * scale, 9 * scale, 0, Math.PI * 2);
  ctx.arc(x, y + 6 * scale, 12 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGround(ctx: CanvasRenderingContext2D, s: GameState, p: Palette) {
  ctx.fillStyle = p.surfaceSunken;
  ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);

  ctx.strokeStyle = p.lineStrong;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 0.5);
  ctx.lineTo(WIDTH, GROUND_Y + 0.5);
  ctx.stroke();

  const offset = s.groundScroll % GROUND_TILE;
  ctx.fillStyle = p.lineStrong;
  for (let x = -offset; x < WIDTH; x += GROUND_TILE) {
    ctx.fillRect(x, GROUND_Y + 12, 16, 3);
  }
  ctx.fillStyle = p.line;
  for (let x = -offset + 24; x < WIDTH; x += GROUND_TILE) {
    ctx.fillRect(x, GROUND_Y + 26, 6, 3);
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle, s: GameState, p: Palette) {
  if (o.kind === 'ground') {
    ctx.save();
    ctx.fillStyle = p.brandDeep;
    for (const st of o.stalks) {
      const x = o.x + st.dx;
      const top = GROUND_Y - st.h;
      roundRect(ctx, x, top, st.w, st.h, Math.min(6, st.w / 2));
      ctx.fill();
      if (st.h > 32) {
        const armY = top + st.h * 0.42;
        roundRect(ctx, x - 5, armY - 8, 5, 12, 2);
        ctx.fill();
        roundRect(ctx, x + st.w, armY - 12, 5, 12, 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = p.brandBright;
    for (const st of o.stalks) {
      roundRect(ctx, o.x + st.dx + 2, GROUND_Y - st.h + 4, 2.4, Math.max(2, st.h - 10), 1.2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Flyer.
  const cx = o.x + o.w / 2;
  const cy = o.topY + o.h / 2;
  const flap = Math.sin(s.tick * 0.5 + o.flap);
  ctx.save();
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.ellipse(cx, cy, o.w * 0.34, o.h * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + o.w * 0.26, cy - 2, o.h * 0.36, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = p.warn;
  ctx.beginPath();
  ctx.moveTo(cx + o.w * 0.46, cy - 3);
  ctx.lineTo(cx + o.w * 0.72, cy);
  ctx.lineTo(cx + o.w * 0.46, cy + 3);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = p.accentSoft;
  ctx.beginPath();
  ctx.moveTo(cx - 2, cy);
  ctx.lineTo(cx - o.w * 0.42, cy + flap * 8 - 6);
  ctx.lineTo(cx - o.w * 0.08, cy + 3);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx + o.w * 0.32, cy - 4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(cx + o.w * 0.34, cy - 4, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEye(ctx: CanvasRenderingContext2D, cx: number, cy: number, dead: boolean, p: Palette) {
  if (dead) {
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy - 3);
    ctx.lineTo(cx + 3, cy + 3);
    ctx.moveTo(cx + 3, cy - 3);
    ctx.lineTo(cx - 3, cy + 3);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(cx + 1, cy, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLegs(ctx: CanvasRenderingContext2D, x0: number, feetY: number, s: GameState, p: Palette, legLen: number) {
  ctx.save();
  ctx.fillStyle = p.brandStrong;
  if (!s.onGround && !s.dead) {
    // Tucked legs mid-jump.
    roundRect(ctx, x0 + 2, feetY - legLen + 2, 7, legLen - 1, 3);
    ctx.fill();
    roundRect(ctx, x0 + 12, feetY - legLen + 3, 7, legLen - 2, 3);
    ctx.fill();
  } else {
    const swing = s.dead ? 0 : Math.sin(s.tick * RUN_CADENCE) * 4;
    roundRect(ctx, x0 + 2 + swing, feetY - legLen, 7, legLen, 3);
    ctx.fill();
    roundRect(ctx, x0 + 12 - swing, feetY - legLen, 7, legLen, 3);
    ctx.fill();
  }
  ctx.restore();
}

function drawDino(ctx: CanvasRenderingContext2D, s: GameState, p: Palette) {
  const feetY = s.dino.y;
  const bx = DINO_X;
  const ducking = isDucking(s);
  const dead = s.dead;

  // Soft contact shadow that shrinks as the runner rises.
  const airFrac = clamp((GROUND_Y - feetY) / 110, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.18 * (1 - airFrac * 0.7);
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.ellipse(bx + (ducking ? DUCK_W : DINO_W) / 2, GROUND_Y + 3, (ducking ? 28 : 20) * (1 - airFrac * 0.4), 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  if (ducking) {
    const top = feetY - DUCK_H;
    ctx.fillStyle = p.brandStrong;
    ctx.beginPath();
    ctx.moveTo(bx + 4, top + 4);
    ctx.lineTo(bx - 10, top + 1);
    ctx.lineTo(bx + 4, top + 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = p.brand;
    roundRect(ctx, bx, top, DUCK_W, DUCK_H, 11);
    ctx.fill();
    roundRect(ctx, bx + DUCK_W - 24, top - 7, 24, 18, 8);
    ctx.fill();
    roundRect(ctx, bx + DUCK_W - 3, top - 2, 10, 9, 4);
    ctx.fill();
    drawEye(ctx, bx + DUCK_W - 7, top - 1, dead, p);
    drawLegs(ctx, bx + 14, feetY, s, p, 6);
  } else {
    const top = feetY - DINO_H;
    ctx.fillStyle = p.brandStrong;
    ctx.beginPath();
    ctx.moveTo(bx + 2, feetY - 20);
    ctx.lineTo(bx - 12, feetY - 10);
    ctx.lineTo(bx + 6, feetY - 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = p.brand;
    roundRect(ctx, bx + 2, feetY - 32, 26, 30, 10);
    ctx.fill();
    roundRect(ctx, bx + 16, top, 22, 22, 9);
    ctx.fill();
    roundRect(ctx, bx + 34, top + 8, 10, 9, 4);
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = p.brandBright;
    roundRect(ctx, bx + 8, feetY - 22, 12, 16, 6);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = p.brandStrong;
    roundRect(ctx, bx + 22, feetY - 19, 8, 5, 2);
    ctx.fill();
    drawEye(ctx, bx + 30, top + 8, dead, p);
    drawLegs(ctx, bx + 8, feetY, s, p, 12);
  }
  ctx.restore();
}

function drawHint(ctx: CanvasRenderingContext2D, s: GameState, p: Palette) {
  const a = s.started ? 0 : clamp(1 - s.elapsed / HINT_FRAMES, 0, 1);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = p.inkSoft;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 15px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('Space / \u2191  jump      \u2193  duck', WIDTH / 2, 36);
  ctx.font = '500 12px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('tap to jump', WIDTH / 2, 56);
  ctx.restore();
}

function drawScene(ctx: CanvasRenderingContext2D, s: GameState, p: Palette, idle: boolean) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, p.surface);
  sky.addColorStop(1, p.brandTint);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawHillLayer(ctx, GROUND_Y + 2, 40, HILL_FAR_FREQ, s.hillFarPhase, p.brandTintStrong, 1);
  drawHillLayer(ctx, GROUND_Y + 2, 26, HILL_MID_FREQ, s.hillMidPhase + HILL_MID_PHASE_OFFSET, p.brand, 0.16);

  for (const c of s.clouds) {
    drawCloud(ctx, c);
  }

  drawGround(ctx, s, p);

  for (const o of s.obstacles) {
    drawObstacle(ctx, o, s, p);
  }

  drawDino(ctx, s, p);

  if (!idle) {
    drawHint(ctx, s, p);
  }
}

// --- Component ---------------------------------------------------------------
export function DinoRun({ active, onScoreChange, onGameOver }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [focused, setFocused] = useState(false);

  // Driving beat while running; jump/land/crash cues fire on the key events.
  const sound = useGameSound(active, 'runner');

  // Keep the latest callbacks in refs so the game loop never has to restart
  // when the parent re-renders with new function identities.
  const onScoreChangeRef = useRef(onScoreChange);
  const onGameOverRef = useRef(onGameOver);
  useEffect(() => {
    onScoreChangeRef.current = onScoreChange;
    onGameOverRef.current = onGameOver;
  });

  // The whole lifecycle hinges on `active`: start fresh + run while true, stop
  // and clean everything up when it flips false (and on unmount).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = clamp(window.devicePixelRatio || 1, 1, 3);
    canvas.width = Math.round(WIDTH * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const palette = readPalette(canvas);

    // Idle: paint a calm standing scene behind the shell's Play chrome.
    if (!active) {
      if (ctx) drawScene(ctx, createState(), palette, true);
      return;
    }

    const state = createState();
    onScoreChangeRef.current(0);
    if (ctx) drawScene(ctx, state, palette, false);
    canvas.focus({ preventScroll: true });

    const raf: (cb: FrameRequestCallback) => number =
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (cb) => window.setTimeout(() => cb(performance.now()), 16);
    const caf: (id: number) => void =
      typeof window.cancelAnimationFrame === 'function'
        ? window.cancelAnimationFrame.bind(window)
        : (id) => window.clearTimeout(id);

    let rafId = 0;
    let last = performance.now();
    let gameOverFired = false;

    const jump = () => {
      if (startJump(state)) sound.playEffect('jump');
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (JUMP_CODES.has(e.code)) {
        e.preventDefault();
        jump();
      } else if (DUCK_CODES.has(e.code)) {
        e.preventDefault();
        setDuck(state, true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (DUCK_CODES.has(e.code)) {
        setDuck(state, false);
      }
    };
    // A real tab-away is the one moment a keyup can't be delivered, so release a
    // held crouch only here — never on a bare window `blur` (see
    // releaseHeldKeysIfHidden), which would pop the runner up on any focus steal.
    const onVisibilityChange = () => {
      releaseHeldKeysIfHidden(state, document.hidden);
    };
    const onPointerDown = (e: Event) => {
      e.preventDefault();
      canvas.focus({ preventScroll: true });
      jump();
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('visibilitychange', onVisibilityChange);
    canvas.addEventListener('pointerdown', onPointerDown);

    const frame = (now: number) => {
      let step = (now - last) / (1000 / 60);
      last = now;
      if (!Number.isFinite(step) || step <= 0) step = 1;
      step = Math.min(step, STEP_CLAMP);

      const prevScore = state.score;
      const wasAirborne = !state.onGround;
      stepPhysics(state, step);
      // A touchdown after a jump: the runner was airborne and is now grounded.
      if (wasAirborne && state.onGround && !state.dead) {
        sound.playEffect('land');
      }
      if (state.score !== prevScore) {
        onScoreChangeRef.current(state.score);
      }

      if (ctx) drawScene(ctx, state, palette, false);

      if (state.dead) {
        if (!gameOverFired) {
          gameOverFired = true;
          sound.playEffect('crash');
          onGameOverRef.current();
        }
        return; // stop the loop; the shell will flip `active` off
      }
      rafId = raf(frame);
    };
    rafId = raf(frame);

    return () => {
      caf(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('pointerdown', onPointerDown);
    };
  }, [active]);

  const wrapperStyle: CSSProperties = {
    width: '100%',
    maxWidth: WIDTH,
    margin: '0 auto',
  };
  const canvasStyle: CSSProperties = {
    display: 'block',
    width: '100%',
    height: 'auto',
    aspectRatio: `${WIDTH} / ${HEIGHT}`,
    maxWidth: WIDTH,
    borderRadius: 18,
    background: 'var(--surface, #fffdf8)',
    border: '1px solid var(--line, #e7e1d4)',
    boxShadow: focused
      ? '0 0 0 3px color-mix(in srgb, var(--brand, #11815a) 45%, transparent)'
      : '0 14px 34px -22px rgba(11, 94, 63, 0.55)',
    outline: 'none',
    touchAction: 'none',
    userSelect: 'none',
    cursor: 'pointer',
  };

  return (
    <div style={wrapperStyle}>
      <canvas
        ref={canvasRef}
        style={canvasStyle}
        tabIndex={0}
        role="img"
        aria-label="Dino Run. Press Space or Arrow Up to jump, Arrow Down to duck. Tap to jump."
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}
