/*
 * Pure, deterministic coin layout for "Slipstream": ordered world-x coin positions
 * from (seed, raceDistance), so both online players see identical coins (yet collect
 * independently). Gaps are seeded-random so spacing feels organic.
 */

import { RACE_DISTANCE } from './racePhysics';
import { hashString, mulberry32 } from './raceRandom';

/** Each coin is worth ONE coin; coins are plentiful for a long string of pickups. */
export const COIN_VALUE = 1;

/* First-coin band (m), kept below the camera WINDOW (100 m) so the opening view always has a coin. */
export const COIN_FIRST_MIN = 40;
export const COIN_FIRST_MAX = 80;
/* Gap band between coins (m) — wide so spacing visibly varies (~50 m avg ≈ 48 coins over 2500 m). */
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

/** Ordered, strictly-increasing coin layout: first in [COIN_FIRST_MIN, COIN_FIRST_MAX), each COIN_MIN_GAP..COIN_MAX_GAP further, stopping COIN_END_MARGIN short of the finish. Empty if the track is too short for one coin. */
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
