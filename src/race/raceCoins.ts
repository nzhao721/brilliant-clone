// Pure, deterministic collectible-coin layout for "Slipstream": the ordered
// world-x positions of coins along the course, as a PURE function of (seed,
// raceDistance). No Date.now()/Math.random(), so it is testable and identical for
// both players in an online race (shared seed) even though each collects
// independently. RaceTrack seats each coin on the hill; RaceView walks this list
// for pickups. Gaps are random (seeded) so the run feels organic, not metronomic.

import { RACE_DISTANCE } from './racePhysics';

/** Each coin is worth ONE coin; coins are plentiful for a long string of pickups. */
export const COIN_VALUE = 1;

// First coin position band (metres), kept below the camera WINDOW (RaceTrack, 100 m)
// so the opening view always contains a coin.
export const COIN_FIRST_MIN = 40;
export const COIN_FIRST_MAX = 80;
// Random gap band between successive coins (metres) — wide so spacing visibly varies
// (~50 m average ≈ 48 coins over a 2500 m course).
export const COIN_MIN_GAP = 20;
export const COIN_MAX_GAP = 80;
// Keep the last coin this far short of the finish line so none sit on it (metres).
export const COIN_END_MARGIN = 75;

/** One collectible coin on the track. */
export type RaceCoin = {
  /** Stable 0-based order index — used as the collected-set key. */
  index: number;
  /** World-x position along the track, in metres (same units as car positions). */
  position: number;
};

// FNV-1a string hash -> unsigned 32-bit (same helper used across the app).
function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32 PRNG -> deterministic floats in [0, 1). Seeded under its own namespace
// so the coin layout is independent of the terrain/question shuffles.
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
 * Builds the ordered coin layout for a track. Positions are strictly increasing:
 * the first coin lands in [COIN_FIRST_MIN, COIN_FIRST_MAX) and each subsequent
 * coin is COIN_MIN_GAP..COIN_MAX_GAP further on, stopping COIN_END_MARGIN short
 * of the finish. Returns an empty list for a track too short to hold one coin.
 */
export function buildRaceCoins(seed: number, raceDistance: number = RACE_DISTANCE): RaceCoin[] {
  const distance = raceDistance > 0 ? raceDistance : RACE_DISTANCE;
  const lastPossible = distance - COIN_END_MARGIN;
  if (lastPossible <= COIN_FIRST_MIN) {
    return [];
  }

  const random = mulberry32(hashString(`race-coins:${seed}`));
  const coins: RaceCoin[] = [];

  let position = COIN_FIRST_MIN + random() * (COIN_FIRST_MAX - COIN_FIRST_MIN);
  let index = 0;
  while (position <= lastPossible) {
    coins.push({ index, position });
    index += 1;
    position += COIN_MIN_GAP + random() * (COIN_MAX_GAP - COIN_MIN_GAP);
  }

  return coins;
}
