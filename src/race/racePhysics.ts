// Pure, deterministic physics for "Slipstream". Shared by the player's car and
// the bot, and by both online and local modes, so it must stay free of Date.now()
// and Math.random(): every result is a pure function of (state, dt, seed). That
// determinism is what lets the bot, the tests, and both online clients agree.

/** A single car's race state. A new object is returned by every helper. */
export type CarState = {
  /** Distance travelled from the start line, in track units. */
  position: number;
  /** Speed in track units/second. Never negative (a stalled car holds still). */
  velocity: number;
  /** Fuel in the tank, kept within [0, TANK_CAPACITY]. */
  fuel: number;
};

// --- Tunable constants (see racePhysics.test.ts) ----------------------------
// Lengths in metres, speeds in m/s, accel in m/s². Tuned for a low-friction,
// momentum-heavy feel: a fuelled car accelerates toward a high flat-ground
// terminal velocity (thrust vs. drag) rather than a hard cap; an empty tank
// coasts a long way before stopping; the gentle-shaped hills carry a strong
// gravity term so grade dominates pace; a full tank banks ~12.5s of thrust.

/**
 * HUD reference / display top speed — NOT a hard cap (velocity is never clamped
 * from above; see stepCar). Set near the flat-ground terminal velocity so the
 * gauge reads ~full at a steady cruise. The track HUD scales by velocity / MAX_SPEED.
 */
export const MAX_SPEED = 112.5;
/** Forward acceleration applied while the tank still has fuel (m/s²). */
export const ACCELERATION = 4.5;
/**
 * Speed-proportional (linear) drag, the dominant brake at speed: balanced against
 * thrust it pins the flat-ground terminal velocity
 * (ACCELERATION - ROLLING_FRICTION) / DRAG_COEFF ~= 112 m/s, and self-limits top
 * speed (there is no hard cap). Kept tiny so the car carries momentum through hill
 * bottoms (its drag there stays well below the gravity term) instead of shedding
 * hard-won downhill speed.
 */
export const DRAG_COEFF = 0.04;
/**
 * Small constant rolling friction (m/s²) on top of the linear drag — the term that
 * lets a coasting, empty-tank car settle to a true 0 (linear drag alone only
 * asymptotes toward it). Kept tiny so even the steepest hill stays climbable from rest.
 */
export const ROLLING_FRICTION = 0.0125;
/**
 * Hill "gravity": uphill slows the car, downhill speeds it up. Deliberately STRONG
 * relative to friction so the gentle-shaped hills still drive pace. Worst-case uphill
 * costs GRAVITY * SLOPE_LIMIT = 3 m/s², below ACCELERATION (4.5) so a fuelled car can
 * always crest from a dead stop; downhill the same term pushes it past terminal velocity.
 */
export const GRAVITY = 37.5;
/** Fuel spent per second while accelerating (only while fuel remains). */
export const FUEL_BURN_RATE = 16;
/**
 * Tank size; addFuel saturates here. A full tank is TANK_CAPACITY / FUEL_BURN_RATE
 * = 12.5s of thrust — enough to bank several correct answers, far short of a whole
 * race — so steady refuelling sets the pace.
 */
export const TANK_CAPACITY = 200;
/** Fuel granted for one correct answer (~2.5s of thrust). */
export const FUEL_PER_CORRECT = 40;
/** Default finish-line distance, in metres. */
export const RACE_DISTANCE = 2500;

// Rolling-hill profile: a sum of a few long-wavelength sines (seed-derived
// amplitude/phase/wavelength), normalized into the band below so the grade is smooth.
/**
 * Steepest grade the hill profile can reach (slopeAt is normalized into
 * [-SLOPE_LIMIT, SLOPE_LIMIT]). Drives BOTH the physics gravity term AND the
 * rendered track curve (RaceTrack derives its hills from slopeAt), so lowering it
 * flattens both at once.
 */
export const SLOPE_LIMIT = 0.08;
const SLOPE_WAVE_COUNT = 3;
const SLOPE_MIN_WAVELENGTH = 30;
const SLOPE_WAVELENGTH_RANGE = 55;

// FNV-1a string hash -> unsigned 32-bit (same helper used across the app).
function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32 PRNG -> deterministic floats in [0, 1). Derives the static hill-wave
// parameters from a seed; the integration itself is pure.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic rolling-hill grade at `position` for track `seed`, within
 * [-SLOPE_LIMIT, SLOPE_LIMIT] (positive is uphill). Normalized by the summed
 * amplitudes so it can never exceed the band yet still varies smoothly.
 */
export function slopeAt(position: number, seed: number): number {
  const random = mulberry32(hashString(`race-slope:${seed}`));
  let sum = 0;
  let amplitudeTotal = 0;

  for (let wave = 0; wave < SLOPE_WAVE_COUNT; wave += 1) {
    const amplitude = 0.5 + random();
    const phase = random() * Math.PI * 2;
    const wavelength = SLOPE_MIN_WAVELENGTH + random() * SLOPE_WAVELENGTH_RANGE;
    sum += amplitude * Math.sin((position / wavelength) * Math.PI * 2 + phase);
    amplitudeTotal += amplitude;
  }

  return (sum / amplitudeTotal) * SLOPE_LIMIT;
}

/**
 * Integrates one tick and returns a NEW state (never mutates the input). Order:
 *   1. While throttling with fuel: add thrust, burn fuel (clamped at empty).
 *   2. Subtract speed-proportional drag + constant ROLLING_FRICTION.
 *   3. Subtract the hill term (uphill slows, downhill speeds up).
 *   4. Floor velocity at 0 (a stalled car never rolls backward); no upper cap.
 *   5. Advance position by the resulting velocity.
 * The hill is sampled at the tick's starting position, so a step depends only on
 * the incoming state.
 *
 * `throttle` gates the thrust (accelerate AND burn fuel only when on the gas with
 * fuel left; otherwise coast). Defaults to `true` so the bot keeps the automatic
 * burn; the human player passes their live hold-to-accelerate input.
 */
export function stepCar(
  state: CarState,
  dtSeconds: number,
  seed: number,
  throttle: boolean = true,
): CarState {
  let velocity = state.velocity;
  let fuel = state.fuel;

  if (throttle && fuel > 0) {
    velocity += ACCELERATION * dtSeconds;
    fuel = Math.max(0, fuel - FUEL_BURN_RATE * dtSeconds);
  }

  velocity -= DRAG_COEFF * velocity * dtSeconds;
  velocity -= ROLLING_FRICTION * dtSeconds;
  velocity -= GRAVITY * slopeAt(state.position, seed) * dtSeconds;

  // Floor only: a stalled car never reverses; thrust vs. drag self-limit the top.
  if (velocity < 0) {
    velocity = 0;
  }

  return {
    position: state.position + velocity * dtSeconds,
    velocity,
    fuel,
  };
}

/** Returns a new state with `amount` fuel added, saturating at TANK_CAPACITY. */
export function addFuel(state: CarState, amount: number): CarState {
  return { ...state, fuel: Math.min(TANK_CAPACITY, state.fuel + amount) };
}

/** True once the car has reached or passed the finish line. */
export function hasFinished(state: CarState, raceDistance: number = RACE_DISTANCE): boolean {
  return state.position >= raceDistance;
}
