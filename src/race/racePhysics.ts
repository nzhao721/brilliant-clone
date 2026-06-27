// Pure, deterministic physics for "Slipstream": a car spends fuel to accelerate
// while friction and the track's rolling hills always bleed off speed. With an
// empty tank the car coasts to a stop on the flat and stalls sooner on an
// uphill. This module is shared verbatim by the player's car and the bot, and
// by both the online and local modes, so it must stay free of Date.now() and
// Math.random(): every result is a pure function of its inputs plus a numeric
// `seed`. The same (state, dt, seed) always yields the same next state, which is
// what lets the bot, the tests, and (for fairness) both online clients agree.

/** A single car's race state. A new object is returned by every helper. */
export type CarState = {
  /** Distance travelled from the start line, in track units. */
  position: number;
  /** Speed in track units/second. Never negative (a stalled car holds still). */
  velocity: number;
  /** Fuel in the tank, kept within [0, TANK_CAPACITY]. */
  fuel: number;
};

// --- Tunable constants ------------------------------------------------------
// UNITS: lengths are in METRES (1 m = 4 of the original world units), speeds in
// m/s, accelerations in m/s². Every length-dimensioned constant below is the old
// value ÷4; the dimensionless ones (DRAG_COEFF rate, SLOPE_LIMIT, fuel) are
// unchanged, so this is a pure unit relabel — the race plays identically (distance
// /4 and speed /4 leave time = distance/speed the same).
//
// Tuned (see racePhysics.test.ts) for a LOW-FRICTION, MOMENTUM-heavy feel: a
// fuelled car on the gas accelerates toward a high flat-ground TERMINAL VELOCITY
// (where thrust balances drag) instead of slamming into a hard cap; an empty tank
// coasts for a very long way before stopping (from 7.5 m/s it takes ~80s to come to
// rest on the flat); the rolling hills are gentle in SHAPE but a deliberately
// STRONG gravity term makes their grade a dominant push/brake (downhill clearly
// speeds the car up, uphill clearly slows it); and a full tank banks a healthy
// reserve of thrust (~12.5s) that players spend gliding and climbing. Friction has
// two parts: a speed-proportional DRAG term (the dominant brake at speed — it is
// what sets the terminal velocity) plus a SMALL constant ROLLING_FRICTION so a
// coasting car actually reaches 0 (pure linear drag only asymptotes toward it).
//
// MOMENTUM FIX: the speed-proportional drag was eased (DRAG_COEFF 0.06 -> 0.04) so
// the car carries momentum at high speed and does NOT shed it "really quickly" at
// the BOTTOM of a hill. Previously drag at a hill-bottom speed (~50 m/s) reached
// ~3 m/s² — as large as the steepest-uphill gravity term (GRAVITY*SLOPE_LIMIT =
// 3) and 2/3 of full thrust — so the car's own drag braked it as hard as the hill
// it was about to climb, and the hard-won downhill speed bled off fast. The lighter
// drag keeps that hill-bottom drag (~2 m/s² at 50) clearly BELOW the gravity term,
// so gravity (UNCHANGED) stays the dominant hill force while momentum is preserved.
//
// Flat-ground terminal velocity =
// (ACCELERATION - ROLLING_FRICTION) / DRAG_COEFF ~= 112 m/s; downhill gravity lets
// the car EXCEED it (the "unlimited" feel) while uphill terminal is lower. The cars
// are fast, so RACE_DISTANCE stays moderate (2500 m) and a race still lasts a
// sensible time (an always-fuelled strong human cruise finishes in ~43s).

/**
 * HUD reference / display top speed — NOT a hard cap. Velocity is no longer
 * clamped from above (see stepCar); this is set to ~ the flat-ground terminal
 * velocity so the speed gauge reads ~full at a steady cruise, with transient
 * downhill overshoot past it expected and fine. Kept exported with the same name
 * and number type because the track HUD scales its gauge by velocity / MAX_SPEED.
 * ≈112.5 m/s tracks the flat terminal velocity; it is the old 450 u/s divided by 4
 * after the length unit became the METRE (see the constants header and DRAG_COEFF).
 */
export const MAX_SPEED = 112.5;
/** Forward acceleration applied while the tank still has fuel (m/s²). */
export const ACCELERATION = 4.5;
/**
 * Speed-proportional (linear) drag coefficient, kept deliberately tiny so the car
 * glides far. The per-tick brake from drag is DRAG_COEFF * velocity, so it grows
 * with speed and, balanced against thrust, pins a flat-ground terminal velocity of
 * (ACCELERATION - ROLLING_FRICTION) / DRAG_COEFF ~= 112 m/s. This is the dominant
 * brake at cruising speed and the mechanism that self-limits top speed now that
 * the hard cap is gone. As a per-second RATE (1/s, not a length) it is the one
 * dynamics constant the metre relabel leaves UNCHANGED.
 *
 * EASED 0.06 -> 0.04 for the momentum fix: at the old value the drag at a
 * hill-bottom speed (~50 m/s) was ~3 m/s², as strong as the steepest-uphill
 * gravity term (GRAVITY * SLOPE_LIMIT = 3) and 2/3 of full thrust, so the car shed
 * its downhill momentum the instant it hit the next climb. At 0.04 the same drag is
 * ~2 m/s² — comfortably below the gravity term — so the car carries speed through
 * hill bottoms while gravity (unchanged) still dominates the grade. Lowering it
 * raises the terminal velocity (hence the matching MAX_SPEED ≈112.5 m/s).
 */
export const DRAG_COEFF = 0.04;
/**
 * Small constant rolling friction (m/s²), applied every tick on top of the linear
 * drag. Linear drag alone only asymptotes toward 0, so this constant term is what
 * lets a coasting, empty-tank car settle to a COMPLETE stop on flat ground. Kept
 * tiny (well under ACCELERATION - GRAVITY * SLOPE_LIMIT ~= 1.5) so even the steepest
 * hill stays climbable from a dead stop, where proportional drag is ~0. Together
 * with the low drag it gives a long glide: from 7.5 m/s a coasting car rolls ~80s
 * before fully stopping on the flat (longer than before, since the drag was eased).
 */
export const ROLLING_FRICTION = 0.0125;
/**
 * Slope coefficient (the hill "gravity"): uphill (positive grade) slows the car,
 * downhill speeds it up. Deliberately STRONG relative to friction so the gentle-
 * SHAPED hills (SLOPE_LIMIT is small, 0.08) still have an obvious effect on pace —
 * going downhill clearly accelerates, going uphill clearly drags. The steepest
 * grade is SLOPE_LIMIT, so the worst-case uphill costs GRAVITY * 0.08 = 3 of
 * deceleration; that is still below ACCELERATION (4.5), leaving net ~+1.49 at rest
 * (after ROLLING_FRICTION, with proportional drag ~0 at zero speed) so a fuelled,
 * throttling car can always crest even the steepest hill from a dead stop — but
 * with a much smaller margin than before, so the climb is genuinely felt. Downhill
 * the same term ADDS speed, letting the car run well past its flat-ground terminal
 * velocity. Note this dwarfs the friction terms (DRAG_COEFF, ROLLING_FRICTION) —
 * and the gap WIDENED after drag was eased for the momentum fix — so on a grade it
 * is gravity, not friction, that dominates. GRAVITY (m/s²) was left UNCHANGED by
 * that fix; the metre relabel since divided it — like every length-dimensioned
 * constant — by 4, preserving the identical up/downhill speed swing in the new units.
 */
export const GRAVITY = 37.5;
/** Fuel spent per second while accelerating (only while fuel remains). */
export const FUEL_BURN_RATE = 16;
/**
 * Tank size; addFuel saturates here so banked correct answers don't overflow.
 * Deliberately large (a full tank is TANK_CAPACITY / FUEL_BURN_RATE = 12.5s of
 * thrust) so players can bank several correct answers before driving, then spend
 * that reserve gliding and climbing hills. Still far short of a whole race
 * (RACE_DISTANCE / MAX_SPEED ~= 22s at the cruise reference), so steady refuelling
 * sets the pace.
 */
export const TANK_CAPACITY = 200;
/** Fuel granted for one correct answer (~2.5s of thrust). */
export const FUEL_PER_CORRECT = 40;
/** Default finish-line distance, in metres. */
export const RACE_DISTANCE = 2500;

// Rolling-hill profile: a sum of a few sines whose amplitudes, phases, and
// wavelengths are derived from the seed, then normalized into the band below.
// Few, long-wavelength waves keep the grade smooth (no jagged spikes per tick).
/**
 * Steepest grade the rolling-hill profile can reach, uphill or downhill;
 * slopeAt is normalized into [-SLOPE_LIMIT, SLOPE_LIMIT]. Kept deliberately gentle
 * (0.08, well down from the old 0.3) so the terrain is much less steep — this one
 * constant drives BOTH the physics gravity term AND the rendered track curve
 * (RaceTrack derives its hills from slopeAt), so lowering it flattens both at once.
 * Exported so callers and tests can reason about the worst-case hill (e.g. that a
 * fuelled car can still climb GRAVITY * SLOPE_LIMIT with ACCELERATION to spare).
 */
export const SLOPE_LIMIT = 0.08;
const SLOPE_WAVE_COUNT = 3;
// Hill wavelengths in metres (the old 120 / 220 world units ÷4). Scaling the
// wavelengths with positions keeps position/wavelength — and therefore the whole
// dimensionless slope profile — identical, so the terrain shape is unchanged.
const SLOPE_MIN_WAVELENGTH = 30;
const SLOPE_WAVELENGTH_RANGE = 55;

// FNV-1a string hash -> unsigned 32-bit. Same helper the leaderboards use, so
// seed derivation is consistent across the app and stable across platforms.
function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32 PRNG -> deterministic floats in [0, 1). Used only to derive the
// (static) hill-wave parameters from a seed; the integration itself is pure.
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
 * Deterministic rolling-hill grade at `position` for a given track `seed`,
 * returned within [-SLOPE_LIMIT, SLOPE_LIMIT]. Positive is uphill. Built from a
 * small sum of sines (seed-derived amplitude/phase/wavelength) and normalized by
 * the summed amplitudes, so it can never exceed the band (worst case: every wave
 * aligned) yet still varies smoothly along the track. Identical (position, seed)
 * always returns the same grade; different seeds give different terrain.
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
 * Integrates one tick of `dtSeconds` and returns a NEW state (never mutates the
 * input). Update order, per the design:
 *   1. While throttling with fuel: add thrust and burn fuel (clamped at empty).
 *   2. Always: subtract speed-proportional drag (DRAG_COEFF * velocity) plus a
 *      small constant ROLLING_FRICTION.
 *   3. Subtract the hill term (uphill slows, downhill speeds up).
 *   4. Floor velocity at 0 — a stalled car holds its spot and never rolls
 *      backward. There is NO upper cap: thrust vs. drag self-limit the top speed
 *      at the terminal velocity (downhill gravity can push it higher).
 *   5. Advance position by the resulting velocity.
 * The hill is sampled at the tick's starting position so a step depends only on
 * the incoming state.
 *
 * `throttle` gates the thrust: the car only accelerates AND burns fuel when the
 * driver is on the gas (`throttle === true`) and the tank isn't empty. With the
 * throttle off (or no fuel) the car simply coasts — friction and the hills still
 * apply, but no fuel is spent. It defaults to `true` so the bot and any existing
 * caller keep the original "burn fuel automatically" behaviour; the human player
 * passes their live hold-to-accelerate input instead.
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

  // Speed-proportional drag is the dominant brake and sets the terminal velocity;
  // the small constant rolling-friction term is what lets a coasting car settle
  // to a true 0 (linear drag alone would only asymptote toward it).
  velocity -= DRAG_COEFF * velocity * dtSeconds;
  velocity -= ROLLING_FRICTION * dtSeconds;
  velocity -= GRAVITY * slopeAt(state.position, seed) * dtSeconds;

  // Floor only: a stalled car never reverses. No upper cap any more — thrust and
  // drag balance out at the terminal velocity, and downhill gravity can exceed it.
  if (velocity < 0) {
    velocity = 0;
  }

  return {
    position: state.position + velocity * dtSeconds,
    velocity,
    fuel,
  };
}

/**
 * Returns a new state with `amount` fuel added, saturating at TANK_CAPACITY so
 * answering while the tank is still full never overflows.
 */
export function addFuel(state: CarState, amount: number): CarState {
  return { ...state, fuel: Math.min(TANK_CAPACITY, state.fuel + amount) };
}

/** True once the car has reached or passed the finish line. */
export function hasFinished(state: CarState, raceDistance: number = RACE_DISTANCE): boolean {
  return state.position >= raceDistance;
}
