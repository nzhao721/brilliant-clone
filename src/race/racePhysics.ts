/* Pure, deterministic "Slipstream" physics: pure functions of (state, dt, seed), so bot, tests, and clients all agree. */

import { hashString, mulberry32 } from './raceRandom';

/** A single car's race state; every helper returns a new object, never mutates. */
export type CarState = {
  /** Distance travelled from the start line, in track units. */
  position: number;
  /** Speed in track units/second; never negative (a stalled car holds still). */
  velocity: number;
  /** Fuel in the tank, kept within [0, TANK_CAPACITY]. */
  fuel: number;
};

/* Tunable constants (see racePhysics.test.ts). Units: m, m/s, m/s². Low-friction/momentum-heavy: no speed cap, long coast, strong gravity so grade dominates. */

/** HUD reference top speed, NOT a hard cap; near flat terminal so the gauge reads ~full at cruise. */
export const MAX_SPEED = 112.5;
/** Forward acceleration while fuelled (m/s²). */
export const ACCELERATION = 4.5;
/** Linear (speed-proportional) drag, the dominant brake; sets flat terminal (ACCELERATION - ROLLING_FRICTION) / DRAG_COEFF ≈ 112 m/s. Tiny so momentum carries hill bottoms. */
export const DRAG_COEFF = 0.04;
/** Small constant rolling friction (m/s²): brings a coasting empty car to a true 0 (drag alone only asymptotes). Tiny so the steepest hill stays climbable. */
export const ROLLING_FRICTION = 0.0125;
/** Hill gravity (uphill slows, downhill speeds up). Strong vs friction so grade drives pace; worst uphill GRAVITY * SLOPE_LIMIT = 3 < ACCELERATION 4.5 so a fuelled car always crests. */
export const GRAVITY = 37.5;
/** Fuel spent per second while accelerating. */
export const FUEL_BURN_RATE = 16;
/** Tank size (addFuel saturates here). Full tank = TANK_CAPACITY / FUEL_BURN_RATE = 12.5s of thrust, so steady refuelling — not one fill — sets pace. */
export const TANK_CAPACITY = 200;
/** Fuel granted for one correct answer (~2.5s of thrust). */
export const FUEL_PER_CORRECT = 40;
/** Default finish-line distance, in metres. */
export const RACE_DISTANCE = 2500;

/* Rolling-hill profile: seeded long-wavelength sines, normalized into the band below. */
/** Steepest grade slopeAt reaches (band [-SLOPE_LIMIT, SLOPE_LIMIT]); drives gravity and the rendered curve. */
export const SLOPE_LIMIT = 0.08;
const SLOPE_WAVE_COUNT = 3;
const SLOPE_MIN_WAVELENGTH = 30;
const SLOPE_WAVELENGTH_RANGE = 55;

/** Deterministic grade at `position` for `seed`, within [-SLOPE_LIMIT, SLOPE_LIMIT] (positive uphill). */
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
 * Integrates one tick, returning a NEW state. The hill is sampled at the starting
 * position so a step depends only on the incoming state; velocity floors at 0 (no
 * reverse) with no upper cap. `throttle` gates thrust + burn (default `true` for the
 * bot's auto-burn; the player passes live hold-to-accelerate input).
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
