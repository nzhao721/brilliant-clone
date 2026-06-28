// Slope (id: slope): a self-contained React + Canvas 2.5-D endless runner. A ball
// rolls down a neon course; steer left/right (momentum, no friction) to follow
// the track, dodge red blocks, and stay on it. Forward speed ramps with time; the
// score counts terrain types crossed.
//
// The endless course is built from self-contained SECTIONS (straight, tunnel,
// bank, curve, city, pinch) placed in a random per-run order. Each section starts
// and ends neutral (centred, standard width, no bank) so any two join smoothly.
// Terrain difficulty is fixed — only forward speed ramps.
//
// Each terrain change steps the course DOWN one level: the ball runs off the
// higher edge and falls across a small void gap onto the next, lower level
// (collision suspended mid-fall, so a drop is never a false loss). Rolling off the
// SIDE plays a brief death-fall animation then game over; an obstacle hit ends
// immediately. The look is a lightweight pseudo-3D projection (perspective-divided
// depth segments, ball pinned near the bottom).
//
// Implements the shared arcade contract: the rAF loop runs only while `active`,
// score via `onScoreChange`, a loss via `onGameOver`; the shell owns all chrome.

import { useEffect, useLayoutEffect, useRef } from 'react';
// `React.JSX.Element` is the React 19 spelling of the contract's `JSX.Element`
// (this project's @types/react has no global JSX). Type-only, erased at build.
import type * as React from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useGameSound } from './useGameSound';

// Shared game contract, re-declared locally so this file imports nothing shared.
type GameProps = {
  active: boolean;
  onScoreChange: (score: number) => void;
  onGameOver: () => void;
};

// ---- Fixed-resolution play field (CSS scales it down responsively) ----
const W = 480;
const H = 600;
const HALF_W = W / 2;
const HALF_H = H / 2;
const HORIZON = Math.round(H * 0.42); // vanishing point: track fills the lower screen
export const BALL_Y = Math.round(H * 0.84); // ball is pinned near the bottom

// ---- Pseudo-3D camera + track (world units) ----
export const ROAD_W = 1250; // nominal half-width of the drivable track
export const SEG = 200; // depth length of a single track segment
const CAM_DEPTH = 0.84; // 1 / tan(fov/2): roughly a 100° field of view
const CAM_H = 1500; // camera height above the (flat) track
const DRAW_N = 150; // segments projected toward the horizon each frame
const OB_DRAW_N = 95; // obstacles only drawn within the nearer segments (far limit)
// ...and near-plane culled once closer than this to the camera (world units): below
// it the perspective divide (and the bank offset, ∝ 1/depth) would blow the red
// wireframe up into a flash as it scrolls past below the ball. Collision is
// separate (depth-gated over the whole volume), so culling the draw never affects it.
export const OB_NEAR_CLIP = 600;
const TUBE_DRAW_N = 70; // tunnel boost arches/chevrons only drawn within the nearer segments
const BUILDING_DRAW_N = 60; // city skyscrapers only drawn within the nearer segments

// ---- Ball ----
const BALL_R = 20;
const BALL_HALF = 0.1; // ball half-width as a fraction of the (nominal) track half-width
// World depth at which the ball sits AHEAD of the camera. The ball is drawn at a
// fixed screen row (BALL_Y), and inverting the same perspective projection used
// for everything else (projY) maps that row to this depth. Collisions are judged
// here — where the ball actually is — not at the camera plane (depth 0), so an
// obstacle is hit exactly when it scrolls down to the ball, never ~7 segments
// later when it finally reaches the camera.
export const BALL_DEPTH = (CAM_DEPTH * CAM_H * HALF_H) / (BALL_Y - HORIZON);

// ---- Pacing (forward speed ramps with time; terrain difficulty does NOT) ----
export const BASE_SPEED = 2400; // world units / second at the start of a run (slightly faster)
export const MAX_SPEED = 5600; // terminal forward speed once the ramp tops out
export const SPEED_RAMP = 64; // forward speed gained per second survived
// Score is driven by terrain CHANGES (one point per jump onto a new terrain
// type), not raw distance — see `update`.

// ---- Momentum steering (lateral acceleration, no friction) ----
const STEER_ACCEL = 4.5; // lateral acceleration (track half-widths / second^2) while held
export const MAX_VX = 2.2; // clamp on lateral velocity (track half-widths / second)
const ABS_X = 3; // absolute safety rail on lateral position

// ---- Obstacles (red blocks) — density is CONSTANT per section kind ----
const OB_HALF = 0.16; // obstacle half-width as a fraction of the nominal track half-width
const SPAWN_PROB = 0.55; // chance an eligible row actually spawns (a touch denser than the sparse pass)
const DOUBLE_PROB = 0.1; // chance a city row holds a second (well-separated) block
const OB_WORLD_H = 720; // block height in world units (projected for a 3D look)
const OB_DEPTH = 150; // block depth in world units

type Obstacle = { x: number; w: number }; // x/w normalised to the NOMINAL track half-width
const NONE: Obstacle[] = [];

// ---- Terrain sections ----
export type SectionKind = 'straight' | 'tunnel' | 'bank' | 'curve' | 'city' | 'pinch';

// Every section kind that can appear in the randomised course.
export const SECTION_KINDS: SectionKind[] = [
  'straight',
  'tunnel',
  'bank',
  'curve',
  'city',
  'pinch',
];

// Inclusive segment-length range per kind. Lengths are static (chosen from the
// section's slice of the per-run RNG), never scaled by progress.
const LEN_RANGE: Record<SectionKind, [number, number]> = {
  straight: [14, 24],
  tunnel: [26, 40],
  bank: [22, 34],
  curve: [28, 44],
  city: [26, 42],
  pinch: [16, 26],
};

const INTRO_SEGS = 20; // opening straight, so a fresh run always starts centred

// Static shape parameters (constant — terrain never gets harder with distance).
const CURVE_MIN = ROAD_W * 0.3; // gentle curve sweep (world units)
const CURVE_MAX = ROAD_W * 0.7; // sharpest curve sweep (world units)
const CITY_WIDEN = 0.7; // city track is up to 1.7x the nominal half-width
const PINCH_NARROW = 0.5; // pinch track narrows to as little as 0.5x
const BANK_GRAVITY = 4.0; // downhill lateral pull on a banked slope (half-widths / s^2)
const BANK_SLOPE = 0.4; // peak sideways tilt of the banked TRACK GEOMETRY (gentler lean)
// (world height per lateral world unit, i.e. tan of the bank angle at its crest)
const TUBE_HALF = 0.98; // half-width the tube walls stop the ball at

// ---- Tunnel ring speed boost (the rings are boost gates) ----
export const RING_BOOST_SPACING = 4; // a boost-gate ARCH every N tunnel segments
const RING_BOOST_ADD = 1200; // forward-speed bump (world units/s) granted per ring gate
const RING_BOOST_MAX = 1500; // cap on accumulated boost (close rings refresh toward this)
const RING_BOOST_DECAY = 1600; // boost decay (world units/s per second) back to the plain ramp
const RING_PULSE_DECAY = 4; // ring-flash fade rate (per second) for the boost visual cue

// Side scenery: neon wireframe skyscraper pillars flanking the track. They flank
// EVERY open terrain (all kinds but the enclosed tunnel); city is densest + tallest.
const CITY_BUILDING_GAP = 3; // city: a pillar row every N segments (densest)
const SIDE_PILLAR_GAP = 5; // other open terrains: sparser rows
const CITY_BUILDING_DEPTH = 150; // building depth in world units
const CITY_GAP_WORLD = 170; // gap between the track edge and the buildings
const CITY_W_MIN = 360;
const CITY_W_MAX = 620;
const CITY_H_MIN = 900; // city: tallest skyline
const CITY_H_MAX = 2700;
const SIDE_H_MIN = 520; // other open terrains: shorter pillars
const SIDE_H_MAX = 1850;

// ---- Step-down transitions between terrain types ----
// Each new terrain type sits one STEP_DROP LOWER than the last (a descending
// staircase of levels). At a transition the higher platform ENDS, a short void
// (TRANSITION_GAP) follows, then the next, lower platform begins. The ball, kept
// moving by its forward velocity, arcs off the edge across the void and FALLS
// under (weak) gravity onto the lower level. The gap is sized so the ball ALWAYS
// clears it (it reaches the far platform long before it could drop a full step),
// so it never falls into the gap — the gap is flavour, not a fail point.
export const STEP_DROP = 520; // world-height each terrain change steps the course down
export const FALL_GRAVITY = 1800; // downward accel (world units / s^2) — a bit heavier, still floaty
const GAP_SEGS = 2; // forward width (segments) of the void between platforms
export const TRANSITION_GAP = GAP_SEGS * SEG; // ...in world units

// ---- Death fall (lateral edge loss only) ----
// Rolling off the SIDE of the track is a genuine loss, but instead of ending the
// run instantly the ball plays a brief tumble-and-shrink fall off the platform,
// THEN game over fires. (Obstacle hits still end immediately; step-down drops
// land safely and never trigger this.)
export const DEATH_TIME = 0.6; // seconds the death fall animates before game over

type Section = {
  kind: SectionKind;
  startSeg: number; // inclusive
  endSeg: number; // exclusive
  seed: number; // per-section seed for its static obstacles
  curveDir: number; // -1 / +1
  curveAmp: number; // world units
  curveMode: 'detour' | 'sCurve';
  bankDir: number; // -1 / +1
  jumpAtStart: boolean; // the terrain TYPE changes here → a step down + score at the seam
  elevation: number; // world height of this level (descends one STEP_DROP per terrain change)
};

// A lazily-extended, contiguous run of sections from segment 0 outward. The
// `rng` closure makes the section ORDER + parameters a deterministic function of
// the seed (so a course is reproducible for tests), while each real run is fed a
// fresh Math.random seed and therefore differs every playthrough.
export type Course = {
  seed: number;
  rng: () => number;
  sections: Section[];
  nextStartSeg: number;
};

type GameState = {
  pos: number; // total distance travelled along the course (world units)
  playerX: number; // lateral position, normalised (±1 ≈ a nominal track half-width)
  vx: number; // lateral velocity (momentum steering), normalised half-widths / second
  steerSmooth: number; // eased lean, follows the lateral velocity for the ball's tilt
  speed: number; // forward speed (world units / second)
  elapsed: number; // seconds the run has been going (drives the forward-speed ramp)
  score: number; // count of terrain-type changes crossed so far
  over: boolean;
  ballY: number; // ball's world height; falls under gravity onto each lower level
  ballVy: number; // vertical velocity (≤ 0 — gravity only, never an upward push)
  dying: number; // seconds left in the lateral-edge death fall (0 = alive/normal)
  dyingDir: number; // which side it fell off (-1 / +1), for the death animation
  dyingBaseX: number; // ball screen X at the instant of death — the fall starts here
  dyingBaseY: number; // ball screen Y at the instant of death — frozen so the arc is smooth
  boost: number; // temporary forward-speed boost from tunnel rings (decays to 0)
  boostPulse: number; // 0..1 ring-flash intensity just after passing a ring gate
  curSectionStart: number; // startSeg of the section the ball is currently in
  lastTime: number; // rAF timestamp of the previous frame (ms)
  course: Course;
};

export type Colors = {
  bgTop: string;
  bgBottom: string;
  roadA: string;
  roadB: string;
  edge: string;
  edgeAlt: string;
  center: string;
  ball: string;
  ballHi: string;
  obstacle: string;
  obstacleTop: string;
  obstacleStripe: string;
  glow: string;
  hint: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// Cheap deterministic hash → [0, 1). Used for per-segment obstacle placement so a
// section's obstacles are a pure function of its seed + the segment index.
function rand(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// Small, fast, seedable PRNG (mulberry32). Drives the per-run section order so it
// is random per run yet reproducible for a given integer seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Course construction -------------------------------------------------

function pickKind(rng: () => number): SectionKind {
  const i = Math.floor(rng() * SECTION_KINDS.length);
  return SECTION_KINDS[i] ?? 'straight';
}

function makeSection(kind: SectionKind, startSeg: number, rng: () => number): Section {
  // Consume the RNG in a FIXED order regardless of kind so the stream stays
  // aligned and the whole course is reproducible from its seed.
  const [lo, hi] = LEN_RANGE[kind];
  const len = lo + Math.floor(rng() * (hi - lo + 1));
  const seed = Math.floor(rng() * 1e9);
  const curveDir = rng() < 0.5 ? -1 : 1;
  const curveAmp = CURVE_MIN + rng() * (CURVE_MAX - CURVE_MIN);
  const curveMode: 'detour' | 'sCurve' = rng() < 0.5 ? 'detour' : 'sCurve';
  const bankDir = rng() < 0.5 ? -1 : 1;
  return {
    kind,
    startSeg,
    endSeg: startSeg + len,
    seed,
    curveDir,
    curveAmp,
    curveMode,
    bankDir,
    jumpAtStart: false, // set by extendCourse once the previous kind is known
    elevation: 0, // set by extendCourse relative to the previous section's level
  };
}

// Build a fresh course. The FIRST section is always a flat, unbanked, fully
// obstacle-free `straight` (a safe start) before the randomised sections begin —
// it's a straight kind (so no bank/tilt, centred, full-width) and `obstaclesOf`
// keeps the whole first section clear of blocks regardless of seed.
export function makeCourse(seed: number): Course {
  const rng = mulberry32(seed);
  const intro = makeSection('straight', 0, rng);
  intro.endSeg = INTRO_SEGS;
  return { seed, rng, sections: [intro], nextStartSeg: INTRO_SEGS };
}

// Lazily append randomly-ordered sections until the course covers `throughSeg`.
export function extendCourse(course: Course, throughSeg: number): void {
  while (course.nextStartSeg <= throughSeg) {
    const last = course.sections[course.sections.length - 1];
    const prev = last?.kind ?? 'straight';
    let kind = pickKind(course.rng);
    // Avoid two pinches in a row so the track can't constrict for too long.
    if (kind === 'pinch' && prev === 'pinch') kind = 'straight';
    const section = makeSection(kind, course.nextStartSeg, course.rng);
    // A step down (+score) happens only where the terrain TYPE actually changes;
    // two same-kind sections in a row merge seamlessly at the same elevation.
    section.jumpAtStart = prev !== section.kind;
    section.elevation = (last?.elevation ?? 0) - (section.jumpAtStart ? STEP_DROP : 0);
    course.sections.push(section);
    course.nextStartSeg = section.endSeg;
  }
}

// The section covering segment `seg` (extends the course on demand).
export function sectionAt(course: Course, seg: number): Section {
  const target = seg < 0 ? 0 : seg;
  if (target >= course.nextStartSeg) extendCourse(course, target);
  const secs = course.sections;
  let lo = 0;
  let hi = secs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = secs[mid];
    if (target < s.startSeg) hi = mid - 1;
    else if (target >= s.endSeg) lo = mid + 1;
    else return s;
  }
  return secs[secs.length - 1] ?? course.sections[0];
}

// Progress through a section as a 0..1 fraction of its depth.
function localT(section: Section, z: number): number {
  const startZ = section.startSeg * SEG;
  const lenZ = (section.endSeg - section.startSeg) * SEG;
  return clamp((z - startZ) / lenZ, 0, 1);
}

// A window that is 0 with 0 slope at both ends (t=0 and t=1). Multiplying every
// section's shape by this guarantees neighbours always meet at the neutral state
// (centre 0, width 1, bank 0) with matching slope → smooth, joinable sections.
function endWindow(t: number): number {
  const s = Math.sin(Math.PI * t);
  return s * s;
}

// ---- Per-depth terrain queries (all neutral at section boundaries) -------

// Lateral offset of the track centreline at depth z (world units). Only curve
// sections wander; everything else stays centred.
export function centerOf(course: Course, z: number): number {
  const section = sectionAt(course, Math.floor(z / SEG));
  if (section.kind !== 'curve') return 0;
  const t = localT(section, z);
  const win = endWindow(t);
  const shape = section.curveMode === 'sCurve' ? win * Math.sin(2 * Math.PI * t) : win;
  return section.curveDir * section.curveAmp * shape;
}

// Track half-width multiplier at depth z. City widens, pinch narrows, the rest
// stay at 1; all return to 1 at the section seams.
export function halfFactorOf(course: Course, z: number): number {
  const section = sectionAt(course, Math.floor(z / SEG));
  if (section.kind === 'city') return 1 + CITY_WIDEN * endWindow(localT(section, z));
  if (section.kind === 'pinch') return 1 - PINCH_NARROW * endWindow(localT(section, z));
  return 1;
}

// Downhill lateral acceleration from a banked slope at depth z (0 elsewhere).
export function bankAccelOf(course: Course, z: number): number {
  const section = sectionAt(course, Math.floor(z / SEG));
  if (section.kind !== 'bank') return 0;
  return section.bankDir * BANK_GRAVITY * endWindow(localT(section, z));
}

// Sideways tilt of the banked TRACK GEOMETRY at depth z (0 off banks). This is a
// property of the track in WORLD SPACE — every banked segment carries it — so an
// approaching bank is visibly tilted far ahead, not only once the ball arrives.
// `m` is a world-height-per-lateral-unit slope: a road point at signed lateral
// offset `o` from the centreline (＋o = right) sits at world height `m · o`. The
// sign is chosen so the LOW (downhill) side matches `bankAccelOf`'s pull, and the
// endWindow keeps the bank easing in/out to neutral at the section seams.
export function bankSlopeOf(course: Course, z: number): number {
  const section = sectionAt(course, Math.floor(z / SEG));
  if (section.kind !== 'bank') return 0;
  return -section.bankDir * BANK_SLOPE * endWindow(localT(section, z));
}

// True when depth z is inside an enclosed tunnel (no edge-falls there).
export function isTunnelOf(course: Course, z: number): boolean {
  return sectionAt(course, Math.floor(z / SEG)).kind === 'tunnel';
}

// Which terrain kinds are flanked by neon skyscraper side pillars: every OPEN
// kind, but NOT the enclosed tunnel (its tube has solid walls, no open sides).
export function hasSidePillars(kind: SectionKind): boolean {
  return kind !== 'tunnel';
}

// Half-width the tube walls stop the ball at inside a tunnel.
function tubeHalfOf(_course: Course, _z: number): number {
  return TUBE_HALF;
}

// World height (elevation) of the level at depth z. Each terrain change steps the
// course down by STEP_DROP, so this descends as the run goes on. It's a property
// of the track, keyed to depth, so lower levels are drawn lower in the distance.
export function elevationOf(course: Course, z: number): number {
  return sectionAt(course, Math.floor(z / SEG)).elevation;
}

// True when depth z lies in a terrain-change VOID gap (the short forward stretch
// with no ground between a higher platform and the next, lower one). Nothing can
// land here — the ball arcs across it under forward momentum.
export function inGapAt(course: Course, z: number): boolean {
  const section = sectionAt(course, Math.floor(z / SEG));
  return section.jumpAtStart && z - section.startSeg * SEG < TRANSITION_GAP;
}

// Segments between obstacle rows, per kind. EVERY terrain type carries red
// blocks; city is the densest, the rest a touch sparser for breathing room.
function obstacleGap(kind: SectionKind): number {
  switch (kind) {
    case 'city':
      return 9; // densest
    case 'straight':
      return 11;
    case 'curve':
      return 11;
    case 'bank':
      return 12;
    case 'pinch':
      return 12;
    default:
      return 14; // tunnel: sparsest
  }
}

// Clearance (segments) after each terrain change before blocks may appear, so
// none land right at the transition (where the ball is still falling / just
// arriving and a block could be unavoidable).
const OBSTACLE_CLEARANCE = 3;

// What (if anything) sits on segment `seg`. Every kind spawns blocks; spacing and
// contents are a function of the section kind + the segment's offset WITHIN its
// section (never the absolute distance), so each kind keeps a constant difficulty.
export function obstaclesOf(course: Course, seg: number): Obstacle[] {
  if (seg < 0) return NONE;
  const section = sectionAt(course, seg);
  // The very first section is a guaranteed safe start: a flat straight with NO
  // obstacles at all, across its whole length, regardless of the random seed.
  if (section.startSeg === 0) return NONE;

  const local = seg - section.startSeg;
  if (local < OBSTACLE_CLEARANCE) return NONE; // keep the transition clear
  if (local % obstacleGap(section.kind) !== 0) return NONE;

  const h = (k: number): number => rand(section.seed * 0.000131 + seg * k);
  if (h(0.37) > SPAWN_PROB) return NONE;

  // Spread blocks across the CURRENT track width so a single block always leaves
  // a passable side — narrow in a pinch, wide in a city, on the tube floor in a
  // tunnel — rather than poking past the edge.
  const spread = 0.7 * halfFactorOf(course, seg * SEG);
  const x = (h(1.93) * 2 - 1) * spread;
  const blocks: Obstacle[] = [{ x, w: OB_HALF }];
  if (section.kind === 'city' && h(2.57) < DOUBLE_PROB) {
    const x2 = (h(3.71) * 2 - 1) * spread;
    // Keep a guaranteed gap between the pair so the row is always navigable.
    if (Math.abs(x2 - x) > OB_HALF * 2 + 0.4) blocks.push({ x: x2, w: OB_HALF });
  }
  return blocks;
}

// ---- Default course backing the pure, exported helpers -------------------
// A fixed-seed course so the exported `centerWorldX` / `obstaclesAt` /
// `hitsObstacleBand` stay pure + deterministic (live runs use a random course).
const DEFAULT_SEED = 0x5eed;
export const DEFAULT_COURSE = makeCourse(DEFAULT_SEED);

// Smooth left/right wander of the track centre as a function of depth, on the
// default course. Zero wherever the covering section is straight (e.g. at z=0).
export function centerWorldX(z: number): number {
  return centerOf(DEFAULT_COURSE, z);
}

// Obstacles on the default course (kept for the pure-function test surface).
export function obstaclesAt(n: number): Obstacle[] {
  return obstaclesOf(DEFAULT_COURSE, n);
}

export function makeState(course: Course = DEFAULT_COURSE): GameState {
  return {
    pos: 0,
    playerX: 0,
    vx: 0,
    steerSmooth: 0,
    speed: BASE_SPEED,
    elapsed: 0,
    score: 0,
    over: false,
    // A fresh run starts grounded on the level-0 intro.
    ballY: 0,
    ballVy: 0,
    dying: 0,
    dyingDir: 1,
    dyingBaseX: 0,
    dyingBaseY: 0,
    boost: 0,
    boostPulse: 0,
    // At pos 0 the ball's depth (BALL_DEPTH) sits inside the opening straight
    // intro, whose startSeg is 0.
    curSectionStart: 0,
    lastTime: 0,
    course,
  };
}

function readColors(): Colors {
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

  // Neon track edges + ball lean on the brand palette; the dark void and red
  // hazard blocks are fixed so the faux-3D scene reads clearly on any theme.
  const brandBright = v('--brand-bright', '#2fd27f');
  const accent = v('--accent', '#ff5a4d');

  return {
    bgTop: '#05070f',
    bgBottom: '#0a1430',
    roadA: '#0f1c30',
    roadB: '#0b1626',
    edge: brandBright,
    edgeAlt: '#eafff5',
    center: brandBright,
    ball: accent,
    ballHi: '#ffd0c7',
    obstacle: '#ff2a4d',
    obstacleTop: '#ff6f86',
    obstacleStripe: 'rgba(255, 255, 255, 0.85)',
    glow: brandBright,
    hint: '#9fb4c9',
  };
}

// Project a world point onto the screen. `scale` (the perspective divide) is the
// same for every point at a given depth, so callers compute it once per segment.
function projX(worldX: number, camX: number, scale: number): number {
  return HALF_W + scale * (worldX - camX) * HALF_W;
}
function projY(scale: number): number {
  return HORIZON + scale * CAM_H * HALF_H;
}

function fillQuad(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): void {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.lineTo(dx, dy);
  ctx.closePath();
  ctx.fill();
}

function drawSky(ctx: CanvasRenderingContext2D, c: Colors): void {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, c.bgTop);
  sky.addColorStop(0.6, c.bgBottom);
  sky.addColorStop(1, '#070d1c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Soft neon glow rising off the vanishing point.
  const glow = ctx.createRadialGradient(HALF_W, HORIZON, 4, HALF_W, HORIZON, 190);
  glow.addColorStop(0, 'rgba(47, 210, 127, 0.30)');
  glow.addColorStop(1, 'rgba(47, 210, 127, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, HORIZON + 60);

  // Thin horizon line tying the sky to the track.
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = c.edge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, HORIZON);
  ctx.lineTo(W, HORIZON);
  ctx.stroke();
  ctx.restore();
}

// Near-plane visibility for an obstacle whose nearest face is at world depth
// `dFront`. Once it's closer than OB_NEAR_CLIP it has scrolled below the ball
// toward the camera and is no longer drawn — keeping the perspective divide from
// ballooning the red wireframe (and its glow) into a flash. Purely a RENDER gate;
// the depth-gated collision is unchanged and still covers the whole block.
export function isObstacleVisible(dFront: number): boolean {
  return dFront >= OB_NEAR_CLIP;
}

function drawObstacle(
  ctx: CanvasRenderingContext2D,
  ob: Obstacle,
  centerX: number,
  camX: number,
  dFront: number,
  groundFront: number,
  levelDY: number, // screen-Y shift for this segment's level (descending staircase)
  bankDY: number, // screen-Y shift from the bank tilt at the block's lateral position
  c: Colors,
): void {
  const dBack = dFront + OB_DEPTH;
  const sF = CAM_DEPTH / dFront;
  const sB = CAM_DEPTH / dBack;
  const worldCx = centerX + ob.x * ROAD_W;

  const cxF = projX(worldCx, camX, sF);
  const cxB = projX(worldCx, camX, sB);
  const halfF = ob.w * sF * ROAD_W * HALF_W;
  const halfB = ob.w * sB * ROAD_W * HALF_W;
  // Seat the block on the surface at its lateral position: its level (descending
  // staircase) plus the bank tilt (so it rides a banked road, not floats above).
  const gFront = groundFront + bankDY;
  const groundBack = projY(sB) + levelDY + bankDY;
  const topF = gFront - OB_WORLD_H * sF * HALF_H;
  const topB = groundBack - OB_WORLD_H * sB * HALF_H;

  // Render a HOLLOW neon-RED wireframe box (rendering only). The depth-gated
  // collision in `hitsObstacleBand`/`update` is unchanged and still covers the
  // block's whole volume, so the hitbox is identical to the old solid block.
  ctx.save();
  ctx.strokeStyle = c.obstacle;
  ctx.shadowColor = c.obstacle;
  ctx.shadowBlur = 12;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = Math.max(1.4, halfF * 0.14);
  ctx.beginPath();
  // Front face.
  ctx.moveTo(cxF - halfF, topF);
  ctx.lineTo(cxF + halfF, topF);
  ctx.lineTo(cxF + halfF, gFront);
  ctx.lineTo(cxF - halfF, gFront);
  ctx.closePath();
  // Back face.
  ctx.moveTo(cxB - halfB, topB);
  ctx.lineTo(cxB + halfB, topB);
  ctx.lineTo(cxB + halfB, groundBack);
  ctx.lineTo(cxB - halfB, groundBack);
  ctx.closePath();
  // Depth edges joining the two faces.
  ctx.moveTo(cxF - halfF, topF);
  ctx.lineTo(cxB - halfB, topB);
  ctx.moveTo(cxF + halfF, topF);
  ctx.lineTo(cxB + halfB, topB);
  ctx.moveTo(cxF - halfF, gFront);
  ctx.lineTo(cxB - halfB, groundBack);
  ctx.moveTo(cxF + halfF, gFront);
  ctx.lineTo(cxB + halfB, groundBack);
  ctx.stroke();

  // A couple of faint hazard rungs across the front face for a grid look.
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let f = 1; f < 3; f += 1) {
    const y = topF + ((gFront - topF) * f) / 3;
    ctx.moveTo(cxF - halfF, y);
    ctx.lineTo(cxF + halfF, y);
  }
  ctx.stroke();
  ctx.restore();
}

// Tunnel rings are ALWAYS the neon-green edge colour — there is no red-ring
// variant any more.
export function tubeRingColor(c: Colors): string {
  return c.edge;
}

// A neon-green ARCH (portal/gateway) spanning the road at a speed-boost gate: two
// feet planted on the LEFT/RIGHT road edges with a rounded top curving over, like
// a doorway the ball rolls under. This replaces the old full boost ring — the gate
// depth and the boost TRIGGER are unchanged, only the drawn shape. `pulse` flashes
// it right after it grants a boost.
function drawBoostArch(
  ctx: CanvasRenderingContext2D,
  centerWorld: number,
  roadHalf: number, // road half-width (world); the feet sit on the road edges
  camX: number,
  scale: number,
  levelDY: number, // screen-Y shift for this segment's level
  pulse: number, // 0..1 boost-flash intensity
  c: Colors,
): void {
  const groundY = projY(scale) + levelDY;
  const footL = projX(centerWorld - roadHalf, camX, scale);
  const footR = projX(centerWorld + roadHalf, camX, scale);
  const cx = projX(centerWorld, camX, scale);
  const halfW = (footR - footL) / 2;
  if (halfW < 4) return; // too far to draw meaningfully
  const archH = roadHalf * 1.6 * scale * HALF_H; // apex height above the road
  const legH = archH * 0.42; // straight legs before the top curves over
  const ctrlY = groundY - 2 * archH + legH; // quad control so the apex reaches archH
  const col = tubeRingColor(c);

  ctx.save();
  ctx.strokeStyle = col;
  ctx.globalAlpha = clamp(0.85 + pulse * 0.15, 0, 1);
  ctx.lineWidth = Math.max(1.5, Math.min(6, halfW * 0.07)) * (1 + pulse * 0.5);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = col;
  ctx.shadowBlur = 14 + pulse * 12;
  ctx.beginPath();
  ctx.moveTo(footL, groundY); // left foot on the road edge
  ctx.lineTo(footL, groundY - legH); // left leg up
  ctx.quadraticCurveTo(cx, ctrlY, footR, groundY - legH); // rounded top over the road
  ctx.lineTo(footR, groundY); // right leg down to the road edge
  ctx.stroke();
  ctx.restore();
}

// Forward-pointing neon chevron painted FLAT on the road, telegraphing the green
// speed-boost arches ahead (boost-pad style). Its apex points down-track (toward
// the horizon); it scales and scrolls with the segment via the same projection.
function drawBoostChevron(
  ctx: CanvasRenderingContext2D,
  cN: number, // world centre at the segment's near depth
  cF: number, // world centre at the far depth
  roadHalf: number, // road half-width (world)
  camX: number,
  s1: number,
  s2: number,
  gN: number, // near ground row (screen Y)
  gF: number, // far ground row (screen Y)
  pulse: number,
  c: Colors,
): void {
  if (gN - gF < 2) return; // too small/far to read
  const halfW = roadHalf * 0.34; // arms reach ~1/3 across the lane
  const nearCx = projX(cN, camX, s1);
  const farCx = projX(cF, camX, s2);
  const t = 0.7; // apex sits 70% up the segment, leaving a gap to the next chevron
  const apexX = nearCx + (farCx - nearCx) * t;
  const apexY = gN + (gF - gN) * t;

  ctx.save();
  ctx.strokeStyle = c.edge;
  ctx.globalAlpha = clamp(0.45 + pulse * 0.4, 0, 1);
  ctx.lineWidth = Math.max(1.5, Math.min(7, (gN - gF) * 0.18));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = c.glow;
  ctx.shadowBlur = 5 + pulse * 8;
  ctx.beginPath();
  ctx.moveTo(projX(cN - halfW, camX, s1), gN);
  ctx.lineTo(apexX, apexY);
  ctx.lineTo(projX(cN + halfW, camX, s1), gN);
  ctx.stroke();
  ctx.restore();
}

// A single neon wireframe skyscraper box, projected front + back faces.
function drawWireBox(
  ctx: CanvasRenderingContext2D,
  xL: number,
  xR: number,
  worldH: number,
  camX: number,
  dF: number,
  dB: number,
  levelDY: number, // screen-Y shift for this building's level
  c: Colors,
): void {
  const sF = CAM_DEPTH / dF;
  const sB = CAM_DEPTH / dB;
  const gF = projY(sF) + levelDY;
  const gB = projY(sB) + levelDY;
  const tF = gF - worldH * sF * HALF_H;
  const tB = gB - worldH * sB * HALF_H;
  const xLF = projX(xL, camX, sF);
  const xRF = projX(xR, camX, sF);
  const xLB = projX(xL, camX, sB);
  const xRB = projX(xR, camX, sB);

  ctx.save();
  ctx.strokeStyle = c.edge;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.2;
  ctx.shadowColor = c.glow;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  // Front + back faces.
  ctx.moveTo(xLF, tF);
  ctx.lineTo(xRF, tF);
  ctx.lineTo(xRF, gF);
  ctx.lineTo(xLF, gF);
  ctx.closePath();
  ctx.moveTo(xLB, tB);
  ctx.lineTo(xRB, tB);
  ctx.lineTo(xRB, gB);
  ctx.lineTo(xLB, gB);
  ctx.closePath();
  // Depth connectors.
  ctx.moveTo(xLF, tF);
  ctx.lineTo(xLB, tB);
  ctx.moveTo(xRF, tF);
  ctx.lineTo(xRB, tB);
  ctx.moveTo(xLF, gF);
  ctx.lineTo(xLB, gB);
  ctx.moveTo(xRF, gF);
  ctx.lineTo(xRB, gB);
  ctx.stroke();

  // Faint "floors" across the front face for a wireframe-grid look.
  ctx.globalAlpha = 0.26;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const floors = 5;
  for (let f = 1; f < floors; f += 1) {
    const y = tF + ((gF - tF) * f) / floors;
    ctx.moveTo(xLF, y);
    ctx.lineTo(xRF, y);
  }
  ctx.stroke();
  ctx.restore();
}

// Background skyscraper pillars flanking BOTH sides of the track (pure scenery —
// never collidable). They follow the curve centreline, sit at the section's
// step-down level, and lean with banks. City is the densest + tallest; the other
// open terrains get sparser, shorter pillars so the sides never read as empty.
function drawSidePillars(
  ctx: CanvasRenderingContext2D,
  section: Section,
  n: number,
  centerWorld: number,
  hw: number,
  camX: number,
  dFront: number,
  levelDY: number, // screen-Y shift for this segment's level (descending staircase)
  bankSlope: number, // bank slope at this depth (0 off banks) — pillars lean on it
  c: Colors,
): void {
  const city = section.kind === 'city';
  if (n % (city ? CITY_BUILDING_GAP : SIDE_PILLAR_GAP) !== 0) return;
  const hMin = city ? CITY_H_MIN : SIDE_H_MIN;
  const hMax = city ? CITY_H_MAX : SIDE_H_MAX;
  const dBack = dFront + CITY_BUILDING_DEPTH;
  const sF = CAM_DEPTH / dFront;
  for (let side = -1; side <= 1; side += 2) {
    const r = rand(section.seed * 0.013 + n * 0.7 + (side > 0 ? 11 : 3));
    const r2 = rand(section.seed * 0.017 + n * 1.1 + (side > 0 ? 5 : 19));
    const worldH = hMin + r * (hMax - hMin);
    const width = CITY_W_MIN + r2 * (CITY_W_MAX - CITY_W_MIN);
    const innerEdge = centerWorld + side * (hw + CITY_GAP_WORLD);
    const a = innerEdge;
    const b = innerEdge + side * width;
    // Lean with the bank: seat the pillar on the banked plane at its own lateral
    // offset from the centreline (0 off banks).
    const lateral = innerEdge + (side * width) / 2 - centerWorld;
    const bankDY = -bankSlope * lateral * sF * HALF_H;
    drawWireBox(ctx, Math.min(a, b), Math.max(a, b), worldH, camX, dFront, dBack, levelDY + bankDY, c);
  }
}

function strokeEdge(ctx: CanvasRenderingContext2D, pts: number[], color: string, glow: string): void {
  if (pts.length < 4) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.9;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
  ctx.restore();
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  c: Colors,
  bodyY: number, // screen Y of the ball body
  groundY: number, // screen Y of the surface beneath it (lower than bodyY while falling)
  showShadow: boolean, // false over a void gap (nothing to cast a shadow onto)
): void {
  // Lateral-edge death fall: tumble off the lost side and shrink/fade into the
  // distance over DEATH_TIME, then the run ends.
  const dyingP = s.dying > 0 ? clamp(1 - s.dying / DEATH_TIME, 0, 1) : 0;

  let bx = HALF_W + s.steerSmooth * 12; // small lean toward the drift direction
  let by = bodyY;
  let r = BALL_R;
  let alpha = 1;
  let castShadow = showShadow;
  if (dyingP > 0) {
    // Continue from the EXACT position the live ball was last drawn at (seeded at
    // death), so there's no first-frame pop: slide off the lost side and accelerate
    // away as a clean projectile arc from that frozen origin.
    bx = s.dyingBaseX + s.dyingDir * dyingP * 150; // slides off the lost side
    by = s.dyingBaseY + dyingP * dyingP * 300; // accelerating fall away off the platform
    r = BALL_R * (1 - 0.6 * dyingP); // shrinks into the distance
    alpha = 1 - 0.5 * dyingP; // fades as it recedes
    castShadow = false;
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  // Contact shadow on the surface below; shrinks + fades as the ball floats up
  // off it while dropping to the next level.
  if (castShadow) {
    const lift = Math.max(0, groundY - bodyY);
    const hf = clamp(lift / 44, 0, 1); // 0 grounded → 1 mid-fall
    ctx.save();
    ctx.globalAlpha = alpha * (1 - 0.7 * hf);
    ctx.fillStyle = 'rgba(4, 8, 16, 0.45)';
    ctx.beginPath();
    ctx.ellipse(
      bx,
      groundY + BALL_R * 0.82,
      BALL_R * (1.15 - 0.45 * hf),
      BALL_R * (0.5 - 0.2 * hf),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = c.ball;
  ctx.shadowBlur = 22;
  const grd = ctx.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.2, bx, by, r);
  grd.addColorStop(0, c.ballHi);
  grd.addColorStop(1, c.ball);
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Rolling speck orbits the centre so the ball reads as spinning forward (and
  // tumbling faster during the death fall).
  const a = s.pos * 0.02 + dyingP * 20;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
  ctx.beginPath();
  ctx.arc(bx + Math.cos(a) * r * 0.42, by + Math.sin(a) * r * 0.42, r * 0.18, 0, Math.PI * 2);
  ctx.fill();

  // Fixed specular highlight.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(bx - r * 0.32, by - r * 0.36, r * 0.22, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, s: GameState, c: Colors): void {
  drawSky(ctx, c);

  const course = s.course;
  const baseN = Math.floor(s.pos / SEG);
  extendCourse(course, baseN + DRAW_N + 2);

  const camX = s.playerX * ROAD_W;
  const camRefY = s.ballY; // camera tracks the ball's height, so lower levels read lower
  // The neon edges are drawn as runs so they can be BROKEN at each step down,
  // rather than diagonally bridging the drop between two levels.
  const leftRuns: number[][] = [];
  const rightRuns: number[][] = [];
  let curLeft: number[] = [];
  let curRight: number[] = [];
  const flushEdges = (): void => {
    if (curLeft.length >= 4) leftRuns.push(curLeft);
    if (curRight.length >= 4) rightRuns.push(curRight);
    curLeft = [];
    curRight = [];
  };

  // Painter's order: far segments first, near ones drawn on top.
  for (let i = DRAW_N; i >= 0; i -= 1) {
    const n = baseN + i;
    const zNear = n * SEG;
    const zFar = zNear + SEG;
    let d1 = zNear - s.pos;
    const d2 = zFar - s.pos;
    if (d2 <= 1) continue; // segment is behind the camera
    if (d1 < 1) d1 = 1; // guard the perspective divide for the nearest sliver

    const section = sectionAt(course, n);
    // Terrain-change void: the first GAP_SEGS of a new (lower) section are the gap
    // between platforms — render nothing here, and break the neon edges across it.
    if (section.jumpAtStart && n - section.startSeg < GAP_SEGS) {
      flushEdges();
      continue;
    }
    const s1 = CAM_DEPTH / d1;
    const s2 = CAM_DEPTH / d2;
    const sy1 = projY(s1);
    const sy2 = projY(s2);
    const cN = centerOf(course, zNear);
    const cF = centerOf(course, zFar);
    const hwN = ROAD_W * halfFactorOf(course, zNear);
    const hwF = ROAD_W * halfFactorOf(course, zFar);

    // Descending staircase: drop this segment by how far its level sits below the
    // ball's current height. Each terrain change is one STEP_DROP lower, so the
    // next level is drawn visibly lower as it recedes ahead — anticipatable.
    const levelN = s1 * (camRefY - section.elevation) * HALF_H;
    const levelF = s2 * (camRefY - section.elevation) * HALF_H;
    const gN = sy1 + levelN; // near ground row at this segment's level
    const gF = sy2 + levelF; // far ground row

    const lx1 = projX(cN - hwN, camX, s1);
    const rx1 = projX(cN + hwN, camX, s1);
    const lx2 = projX(cF - hwF, camX, s2);
    const rx2 = projX(cF + hwF, camX, s2);

    // Sideways bank applied in WORLD SPACE about the (level-adjusted) centreline.
    const bankN = bankSlopeOf(course, zNear);
    const eN = bankN * hwN * s1 * HALF_H;
    const eF = bankSlopeOf(course, zFar) * hwF * s2 * HALF_H;
    const lyN = gN + eN; // near-left screen Y
    const ryN = gN - eN; // near-right screen Y
    const lyF = gF + eF; // far-left screen Y
    const ryF = gF - eF; // far-right screen Y
    const even = (n & 1) === 0;

    // Road surface (a banked quad at this level).
    ctx.fillStyle = even ? c.roadA : c.roadB;
    fillQuad(ctx, lx2, lyF, rx2, ryF, rx1, ryN, lx1, lyN);

    // Rumble strips along each edge, alternating brightness for a sense of speed.
    const w1 = s1 * hwN * HALF_W;
    const w2 = s2 * hwF * HALF_W;
    const rum1 = Math.max(2, w1 * 0.1);
    const rum2 = Math.max(1, w2 * 0.1);
    ctx.fillStyle = even ? c.edge : c.edgeAlt;
    fillQuad(ctx, lx2, lyF, lx2 + rum2, lyF, lx1 + rum1, lyN, lx1, lyN);
    fillQuad(ctx, rx2 - rum2, ryF, rx2, ryF, rx1, ryN, rx1 - rum1, ryN);

    // Dashed centre line (every other segment); the centreline is the bank hinge.
    if (even) {
      const cw1 = Math.max(1, w1 * 0.03);
      const cw2 = Math.max(0.5, w2 * 0.03);
      const mid1 = projX(cN, camX, s1);
      const mid2 = projX(cF, camX, s2);
      ctx.fillStyle = c.center;
      fillQuad(ctx, mid2 - cw2, gF, mid2 + cw2, gF, mid1 + cw1, gN, mid1 - cw1, gN);
    }

    // Green boost chevrons on the tunnel floor, telegraphing the speed-boost arches
    // ahead — painted on the non-gate segments leading up to each gate.
    if (section.kind === 'tunnel' && i < TUBE_DRAW_N && !isBoostGateSeg(n)) {
      drawBoostChevron(ctx, cN, cF, hwN, camX, s1, s2, gN, gF, s.boostPulse, c);
    }

    // Per-kind scenery, shifted to this segment's level. Open terrains are flanked
    // by skyscraper side pillars; the tunnel renders like the open track (road +
    // standard neon edges) with just a green speed-boost ARCH at each gate segment —
    // no enclosing wall lines.
    if (hasSidePillars(section.kind)) {
      if (i < BUILDING_DRAW_N) {
        drawSidePillars(ctx, section, n, cN, hwN, camX, d1, levelN, bankN, c);
      }
    } else if (section.kind === 'tunnel' && i < TUBE_DRAW_N && isBoostGateSeg(n)) {
      drawBoostArch(ctx, cN, hwN, camX, s1, levelN, s.boostPulse, c);
    }

    curLeft.push(lx1, lyN);
    curRight.push(rx1, ryN);

    // Near-plane cull: skip obstacles that have scrolled too close to the camera
    // (below the ball), where the projection would blow the red box up into a
    // flash. `d1` is the segment's near depth. Collision is depth-gated + separate.
    if (i < OB_DRAW_N && isObstacleVisible(d1)) {
      const obs = obstaclesOf(course, n);
      for (let k = 0; k < obs.length; k += 1) {
        // Bank tilt at the block's lateral position (0 off banks), matching the
        // road's banked cross-section so the block sits on the tilted surface.
        const obBankDY = -bankSlopeOf(course, zNear) * obs[k].x * ROAD_W * s1 * HALF_H;
        drawObstacle(ctx, obs[k], cN, camX, d1, gN, levelN, obBankDY, c);
      }
    }

  }
  flushEdges();

  // Glowing neon edges over each contiguous run of track (broken at each step).
  for (let r = 0; r < leftRuns.length; r += 1) strokeEdge(ctx, leftRuns[r], c.edge, c.glow);
  for (let r = 0; r < rightRuns.length; r += 1) strokeEdge(ctx, rightRuns[r], c.edge, c.glow);

  // The ball stays screen-pinned (the camera tracks its height); its shadow sits
  // on the surface below. While it FALLS to a lower level the body floats above
  // its shadow until it lands. Bank seating shifts the contact sideways-on. No
  // shadow is drawn while it's arcing over a void gap (nothing to cast onto).
  const ballZ = s.pos + BALL_DEPTH;
  const scaleBall = CAM_DEPTH / BALL_DEPTH;
  const ballOffset = s.playerX * ROAD_W - centerOf(course, ballZ);
  const bankBallY = -bankSlopeOf(course, ballZ) * ballOffset * scaleBall * HALF_H;
  const fallGap = scaleBall * (s.ballY - elevationOf(course, ballZ)) * HALF_H; // ≥ 0 mid-fall
  drawBall(ctx, s, c, BALL_Y + bankBallY, BALL_Y + bankBallY + fallGap, !inGapAt(course, ballZ));

  // Brief dim on the final frame; the shell renders the real game-over panel.
  if (s.over) {
    ctx.fillStyle = 'rgba(8, 12, 22, 0.4)';
    ctx.fillRect(0, 0, W, H);
  }
}

function drawIdle(ctx: CanvasRenderingContext2D, c: Colors): void {
  draw(ctx, makeState(), c);
  ctx.textAlign = 'center';
  ctx.fillStyle = c.hint;
  ctx.font = '700 19px Inter, system-ui, sans-serif';
  ctx.fillText('Steer with \u2190 \u2192 or A / D', HALF_W, HORIZON - 74);
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.font = '600 14px Inter, system-ui, sans-serif';
  ctx.fillText('Dodge the red blocks \u2014 ride tunnels, banks & curves', HALF_W, HORIZON - 50);
  ctx.restore();
  ctx.textAlign = 'start';
}

// True when a ball steered to lateral position `playerX` overlaps an obstacle on
// the given course whose segment front the ball's collision point crossed while
// advancing from world depth `fromZ` to `toZ` this tick. Scanning every segment
// front in that band preserves the anti-tunnelling guarantee on fast frames,
// while bounding the scan to the band is what fixes the stale-collision bug: an
// obstacle is only testable while it sits at the ball's depth. Once it has
// scrolled past the ball it falls behind the band (its front is below `fromZ`)
// and can never be hit again no matter how the ball steers; one not yet reached
// is still ahead of the band (its front is above `toZ`) and likewise can't fire
// early.
function hitsBandOf(course: Course, playerX: number, fromZ: number, toZ: number): boolean {
  const firstSeg = Math.floor(fromZ / SEG) + 1;
  const lastSeg = Math.floor(toZ / SEG);
  for (let n = firstSeg; n <= lastSeg; n += 1) {
    const obs = obstaclesOf(course, n);
    if (obs.length === 0) continue;
    // Obstacle x is relative to the track centre at the obstacle's own depth.
    const ballRel = playerX - centerOf(course, n * SEG) / ROAD_W;
    for (let k = 0; k < obs.length; k += 1) {
      if (Math.abs(ballRel - obs[k].x) < BALL_HALF + obs[k].w) return true;
    }
  }
  return false;
}

// Pure depth-band collision against the default course (test surface).
export function hitsObstacleBand(playerX: number, fromZ: number, toZ: number): boolean {
  return hitsBandOf(DEFAULT_COURSE, playerX, fromZ, toZ);
}

// A boost-gate segment: in a tunnel these carry the speed-boost ARCH and are the
// segments whose crossing grants the temporary forward-speed boost. Exported so the
// renderer (the arch) and the boost trigger stay in lockstep — same segments.
export function isBoostGateSeg(n: number): boolean {
  return n % RING_BOOST_SPACING === 0;
}

// True when the ball passed at least one tunnel boost gate while advancing from
// depth `fromZ` to `toZ` this tick. Gates are the arch segments (every
// RING_BOOST_SPACING) on a tunnel's platform — not the void gap.
function crossedRingBoost(course: Course, fromZ: number, toZ: number): boolean {
  const firstN = Math.floor(fromZ / SEG) + 1;
  const lastN = Math.floor(toZ / SEG);
  for (let n = firstN; n <= lastN; n += 1) {
    if (!isBoostGateSeg(n)) continue;
    const z = n * SEG;
    if (isTunnelOf(course, z) && !inGapAt(course, z)) return true;
  }
  return false;
}

// Advance the simulation by dt seconds. `dir` (-1/0/1) is a lateral ACCELERATION
// request (momentum steering). Returns true when the score changed this tick.
// An obstacle hit ends the run immediately (`over`); rolling off the SIDE starts
// a brief death fall (`dying`) and only flips `over` once it finishes. Tunnels
// replace edge-falls with hard tube walls; banks add a downhill pull; at a
// terrain change the ball drops to the next, lower level under weak gravity
// across a small void gap (collision suspended until it lands).
export function update(s: GameState, dt: number, dir: number): boolean {
  // Death fall in progress (lateral edge loss): the world keeps scrolling FORWARD
  // at the speed it had when the fall began — so the ball flies off forward as it
  // tumbles off the side — but input, scoring, collision and the rest of the sim
  // stay frozen (the tumble-off is purely a draw-time animation). After DEATH_TIME
  // the run ends; `onGameOver` fires once when `over` flips.
  if (s.dying > 0) {
    s.dying = Math.max(0, s.dying - dt);
    s.pos += s.speed * dt; // keep moving forward; nothing else changes
    if (s.dying === 0) s.over = true;
    return false;
  }
  if (s.over) return false;

  const course = s.course;

  s.elapsed += dt;
  // Tunnel rings grant a TEMPORARY forward-speed boost that decays back to the
  // ramp. Decay it (and the ring flash) first; the speed below carries whatever
  // boost remains.
  s.boost = Math.max(0, s.boost - RING_BOOST_DECAY * dt);
  s.boostPulse = Math.max(0, s.boostPulse - RING_PULSE_DECAY * dt);
  // Base forward speed ramps up the longer you survive (terrain difficulty does
  // not); the ring boost rides on top for a short, decaying burst.
  const rampedSpeed = Math.min(MAX_SPEED, BASE_SPEED + s.elapsed * SPEED_RAMP);
  s.speed = rampedSpeed + s.boost;

  const prevPos = s.pos;
  s.pos += s.speed * dt;

  // The ball avatar sits BALL_DEPTH ahead of the camera; judge everything where
  // it actually is. Build the course far enough to cover that depth + lookahead.
  const ballZ = s.pos + BALL_DEPTH;
  extendCourse(course, Math.floor(ballZ / SEG) + 2);

  // Boost gate: passing a tunnel ring refreshes the boost (capped, so rings close
  // together top it up rather than stacking without bound) and flashes the rings.
  if (crossedRingBoost(course, prevPos + BALL_DEPTH, ballZ)) {
    s.boost = Math.min(RING_BOOST_MAX, s.boost + RING_BOOST_ADD);
    s.boostPulse = 1;
  }

  // Step-down between levels: when the ball crosses onto a lower terrain its
  // ground drops by STEP_DROP, so it runs off the higher edge and FALLS under
  // (weak) gravity — gaining no upward velocity — until it lands on the lower one.
  const groundE = elevationOf(course, ballZ);
  const overGap = inGapAt(course, ballZ); // over the void between platforms (no ground to land on)
  if (overGap || s.ballY > groundE) {
    s.ballVy -= FALL_GRAVITY * dt; // gravity only; vy stays ≤ 0 (never an upward push)
    s.ballY += s.ballVy * dt;
    // Land only on real ground, never mid-gap. The small gap is always cleared by
    // forward momentum long before the ball could drop a full step.
    if (!overGap && s.ballY <= groundE) {
      s.ballY = groundE; // landed on the lower level
      s.ballVy = 0;
    }
  } else {
    s.ballY = groundE; // grounded on the current level
    s.ballVy = 0;
  }
  const falling = overGap || s.ballY > groundE; // airborne (over a gap or still dropping)

  // ---- Momentum steering: input is acceleration, with no friction ----
  s.vx = clamp(s.vx + dir * STEER_ACCEL * dt, -MAX_VX, MAX_VX);
  // A banked slope drags the ball toward its low side; the player must fight it
  // — but only while grounded (no contact, no pull, while falling between levels).
  if (!falling) {
    s.vx = clamp(s.vx + bankAccelOf(course, ballZ) * dt, -MAX_VX, MAX_VX);
  }
  s.playerX += s.vx * dt;

  // Visual lean eases toward the current lateral velocity.
  const leanTarget = clamp(s.vx / MAX_VX, -1, 1);
  s.steerSmooth += (leanTarget - s.steerSmooth) * Math.min(1, dt * 9);

  // ---- Scoring: exactly +1 each time the terrain TYPE changes ----
  let gained = false;
  const ballSection = sectionAt(course, Math.floor(ballZ / SEG));
  if (ballSection.startSeg !== s.curSectionStart) {
    if (ballSection.jumpAtStart) {
      s.score += 1; // dropped onto a new terrain type
      gained = true;
    }
    s.curSectionStart = ballSection.startSeg;
  }

  // While falling between levels the ground rules are suspended: no edge/tube
  // containment and no obstacle hits, so the drop can never cause a false loss.
  // Collision/containment resume the instant the ball lands on the lower level.
  if (!falling) {
    // ---- Containment at the ball's true depth ----
    const centerNorm = centerOf(course, ballZ) / ROAD_W;
    if (isTunnelOf(course, ballZ)) {
      // Enclosed tube: the walls stop the ball — there is NO fall off the edge.
      const half = tubeHalfOf(course, ballZ);
      if (s.playerX < centerNorm - half) {
        s.playerX = centerNorm - half;
        if (s.vx < 0) s.vx = 0;
      } else if (s.playerX > centerNorm + half) {
        s.playerX = centerNorm + half;
        if (s.vx > 0) s.vx = 0;
      }
    } else {
      // Open track (straight / curve / city / pinch) or banked slope: rolling
      // past a side ends the run. `half` narrows in a pinch, widens in a city.
      const half = halfFactorOf(course, ballZ);
      if (Math.abs(s.playerX - centerNorm) > half) {
        // Genuine lateral loss: roll off the side. Begin the death fall (a brief
        // tumble off the platform) rather than ending the run instantly.
        s.dying = DEATH_TIME;
        s.dyingDir = s.playerX >= centerNorm ? 1 : -1;
        // Seed the tumble from the ball's EXACT current on-screen position so frame
        // one continues smoothly (no pop): the same lean X and banked Y the live
        // ball was just drawn at. Frozen for the whole fall → a clean projectile arc
        // that doesn't drift as the world keeps scrolling beneath it.
        const scaleBall = CAM_DEPTH / BALL_DEPTH;
        const ballOffset = s.playerX * ROAD_W - centerOf(course, ballZ);
        const bankBallY = -bankSlopeOf(course, ballZ) * ballOffset * scaleBall * HALF_H;
        s.dyingBaseX = HALF_W + s.steerSmooth * 12;
        s.dyingBaseY = BALL_Y + bankBallY;
        return gained;
      }
    }

    // ---- Obstacle hit: depth-band sweep at the ball's true depth (ends now) ----
    if (hitsBandOf(course, s.playerX, prevPos + BALL_DEPTH, s.pos + BALL_DEPTH)) {
      s.over = true;
      return gained;
    }
  }

  // Absolute safety rail so a long unchecked drift can't diverge.
  s.playerX = clamp(s.playerX, -ABS_X, ABS_X);

  return gained;
}

// A small control-hint legend shown BELOW the game window, mirroring the inline
// style Tetris uses for its hint line (same 0.72rem size, muted --ink-faint
// colour, 1.5 leading). Tetris styles its hint inline (not via a styles.css
// class), so this is reused inline too — just centred, since SlopeRun has no
// side column. Nothing in styles.css is touched.
const hintStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: 'var(--ink-faint, #6b7280)',
  lineHeight: 1.5,
  margin: '0.5rem 0 0',
  textAlign: 'center',
  maxWidth: W,
};

export function SlopeRun({ active, onScoreChange, onGameOver }: GameProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const colorsRef = useRef<Colors>(readColors());
  const stateRef = useRef<GameState>(makeState());

  // Keep the latest callbacks in refs so the rAF loop (which only depends on
  // `active`) never restarts just because the parent passed new function
  // identities on a re-render (it re-renders every timer tick).
  const onScoreChangeRef = useRef(onScoreChange);
  const onGameOverRef = useRef(onGameOver);
  onScoreChangeRef.current = onScoreChange;
  onGameOverRef.current = onGameOver;

  // Stable handle, mirrored into a ref so the rAF loop closure (keyed only on
  // `active`) always reaches the latest engine without depending on it.
  const sound = useGameSound(active, 'slope');
  const soundRef = useRef(sound);
  soundRef.current = sound;

  // Cross-frame audio bookkeeping, reset on each fresh run: whether the ball was
  // airborne last frame (so the step-down leap/land cue fires on the edges).
  const prevFallingRef = useRef(false);

  // Live input state (refs so changes never restart the loop or re-render).
  const leftHeldRef = useRef(false);
  const rightHeldRef = useRef(false);
  const pointerSteerRef = useRef(0); // -1 / 0 / 1 from touch/mouse on a track half
  const pointerDownRef = useRef(false);

  // One-time canvas bitmap setup (DPR scaling) + initial idle paint.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    colorsRef.current = readColors();
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxRef.current = ctx;
      drawIdle(ctx, colorsRef.current);
    }
  }, []);

  // The loop runs ONLY while `active`: a fresh run on activate, full stop +
  // cleanup on deactivate/unmount.
  useEffect(() => {
    if (!active) {
      const ctx = ctxRef.current;
      if (ctx) drawIdle(ctx, colorsRef.current);
      return;
    }

    // Fresh run every time the session (re)starts — including a brand-new
    // randomly-ordered course, so the terrain sequence differs each playthrough.
    const seed = (Math.floor(Math.random() * 0x7fffffff) ^ Date.now()) >>> 0;
    const state = makeState(makeCourse(seed));
    stateRef.current = state;
    onScoreChangeRef.current(0);
    leftHeldRef.current = false;
    rightHeldRef.current = false;
    pointerSteerRef.current = 0;
    pointerDownRef.current = false;
    // Fresh-run audio: reset the per-run cue trackers and sound the countdown's
    // "go" the instant the run starts (the music itself is owned by the helper).
    prevFallingRef.current = false;
    soundRef.current.playEffect('gameStart');
    colorsRef.current = readColors();
    containerRef.current?.focus({ preventScroll: true });

    let raf = 0;
    let running = true;
    let overSignaled = false;

    const step = (now: number): void => {
      if (!running) return;
      const s = stateRef.current;
      if (s.lastTime === 0) s.lastTime = now;
      let dt = (now - s.lastTime) / 1000;
      s.lastTime = now;
      // Clamp dt so a backgrounded tab can't teleport the ball through the track.
      dt = clamp(dt, 0, 1 / 30);

      const dir = clamp(
        (rightHeldRef.current ? 1 : 0) - (leftHeldRef.current ? 1 : 0) + pointerSteerRef.current,
        -1,
        1,
      );

      // Snapshot the fields the audio cues compare against before the sim mutates
      // them this tick (death-fall + immediate-over edges, and the boost flash).
      const prevDying = s.dying;
      const prevOver = s.over;
      const prevBoostPulse = s.boostPulse;

      const gained = update(s, dt, dir);
      if (gained) onScoreChangeRef.current(s.score);

      // ---- Arcade audio: fire one-shot effects on the run's REAL events ----
      const snd = soundRef.current;
      // Crossed a tunnel boost gate (the rings): the flash jumps to 1 only on a
      // crossing, so a rise in it pinpoints the gate — a speed-boost power-up.
      if (s.boostPulse > prevBoostPulse + 1e-6) snd.playEffect('powerup');
      // A step-down between levels reads as a jump: cue the leap when the ball
      // runs off the higher edge and the thud when it lands on the lower one.
      // Only while alive and not in a lateral death fall (that has its own cue).
      let falling = false;
      if (!s.over && s.dying === 0) {
        const ballZ = s.pos + BALL_DEPTH;
        falling = inGapAt(s.course, ballZ) || s.ballY > elevationOf(s.course, ballZ) + 1e-6;
        if (falling && !prevFallingRef.current) snd.playEffect('jump');
        else if (!falling && prevFallingRef.current) snd.playEffect('land');
      }
      prevFallingRef.current = falling;
      // The fatal beat, right before game over: rolling off the SIDE starts a
      // brief death fall, while an obstacle hit ends instantly. Fire exactly one
      // 'crash' for either — at the death fall's START, or on the instant hit
      // (the `prevDying === 0` guard stops the fall's later over-flip re-firing).
      if (s.dying > 0 && prevDying === 0) snd.playEffect('crash');
      else if (s.over && !prevOver && prevDying === 0) snd.playEffect('crash');

      const ctx = ctxRef.current;
      if (ctx) draw(ctx, s, colorsRef.current);

      if (s.over) {
        running = false;
        if (!overSignaled) {
          overSignaled = true;
          onGameOverRef.current();
        }
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowLeft' || e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.code === 'KeyA') {
        e.preventDefault(); // don't let steering scroll the page
        leftHeldRef.current = true;
      } else if (
        e.key === 'ArrowRight' ||
        e.code === 'ArrowRight' ||
        e.key === 'd' ||
        e.key === 'D' ||
        e.code === 'KeyD'
      ) {
        e.preventDefault();
        rightHeldRef.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowLeft' || e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.code === 'KeyA') {
        leftHeldRef.current = false;
      } else if (
        e.key === 'ArrowRight' ||
        e.code === 'ArrowRight' ||
        e.key === 'd' ||
        e.key === 'D' ||
        e.code === 'KeyD'
      ) {
        rightHeldRef.current = false;
      }
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      leftHeldRef.current = false;
      rightHeldRef.current = false;
      pointerSteerRef.current = 0;
      pointerDownRef.current = false;
    };
  }, [active]);

  // Touch/mouse steering: pressing (or dragging across) the left half steers
  // left, the right half steers right. Pointer capture keeps tracking a drag
  // that wanders outside the play area.
  const sideFromEvent = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    pointerSteerRef.current = e.clientX - rect.left < rect.width / 2 ? -1 : 1;
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!active) return;
    e.preventDefault();
    pointerDownRef.current = true;
    containerRef.current?.focus({ preventScroll: true });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture can throw on stale ids; steering still works without it.
    }
    sideFromEvent(e);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!active || !pointerDownRef.current) return;
    sideFromEvent(e);
  };

  const handlePointerEnd = (e: ReactPointerEvent<HTMLDivElement>): void => {
    pointerDownRef.current = false;
    pointerSteerRef.current = 0;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Releasing an already-released pointer is fine to ignore.
    }
  };

  return (
    <div style={{ display: 'grid', placeItems: 'center', width: '100%' }}>
      <div
        ref={containerRef}
        role="application"
        aria-label="Slope minigame. Steer the rolling ball down the neon slope with the Left and Right arrows or A and D; momentum carries the ball, so ease off to keep drifting. Dodge the red blocks, ride the tunnels and banked curves, and don't roll off the open edges."
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: W,
          outline: 'none',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-hidden="true"
          style={{
            display: 'block',
            width: '100%',
            height: 'auto',
            aspectRatio: `${W} / ${H}`,
            borderRadius: 'var(--r-lg, 24px)',
            boxShadow: 'var(--shadow-md, 0 16px 44px rgba(20, 33, 46, 0.09))',
            background: '#05070f',
            cursor: 'pointer',
          }}
        />
      </div>
      <p style={hintStyle}>
        <span aria-hidden="true">◀ ▶</span> or A / D to steer · on touch, tap or hold the left / right
        side
      </p>
    </div>
  );
}
