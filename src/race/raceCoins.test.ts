import { describe, expect, it } from 'vitest';
import {
  buildRaceCoins,
  COIN_END_MARGIN,
  COIN_FIRST_MAX,
  COIN_FIRST_MIN,
  COIN_MAX_GAP,
  COIN_MIN_GAP,
  COIN_VALUE,
} from './raceCoins';
import { RACE_DISTANCE } from './racePhysics';

describe('buildRaceCoins', () => {
  it('is deterministic for a given seed', () => {
    const first = buildRaceCoins(4242, RACE_DISTANCE);
    const second = buildRaceCoins(4242, RACE_DISTANCE);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });

  it('produces a different layout for a different seed', () => {
    const a = buildRaceCoins(1, RACE_DISTANCE).map((coin) => coin.position);
    const b = buildRaceCoins(2, RACE_DISTANCE).map((coin) => coin.position);
    expect(a).not.toEqual(b);
  });

  it('keeps every coin past the start and before the finish', () => {
    const coins = buildRaceCoins(99, RACE_DISTANCE);
    for (const coin of coins) {
      expect(coin.position).toBeGreaterThan(0);
      expect(coin.position).toBeLessThanOrEqual(RACE_DISTANCE - COIN_END_MARGIN);
      expect(coin.position).toBeLessThan(RACE_DISTANCE);
    }
    // The first coin lands a little past the start (inside the opening view).
    expect(coins[0].position).toBeGreaterThanOrEqual(COIN_FIRST_MIN);
    expect(coins[0].position).toBeLessThan(COIN_FIRST_MAX);
  });

  it('lists coins strictly increasing with in-range random gaps', () => {
    const coins = buildRaceCoins(7, RACE_DISTANCE);
    expect(coins.length).toBeGreaterThan(1);
    for (let i = 1; i < coins.length; i += 1) {
      const gap = coins[i].position - coins[i - 1].position;
      expect(coins[i].position).toBeGreaterThan(coins[i - 1].position);
      expect(gap).toBeGreaterThanOrEqual(COIN_MIN_GAP);
      expect(gap).toBeLessThanOrEqual(COIN_MAX_GAP);
    }
  });

  it('assigns sequential indices and exposes a coin worth one', () => {
    const coins = buildRaceCoins(55, RACE_DISTANCE);
    coins.forEach((coin, i) => expect(coin.index).toBe(i));
    expect(COIN_VALUE).toBeGreaterThan(0);
    // Each coin is now worth exactly ONE (was 5); plentiful rather than rich.
    expect(COIN_VALUE).toBe(1);
  });

  it('scatters about twice the original coin count with organic spacing', () => {
    const coins = buildRaceCoins(4242, RACE_DISTANCE);
    /* The ~50 m-average gap band holds ~48 coins on the 2500 m course — about double the original ~24. */
    expect(coins.length).toBeGreaterThan(40);
    expect(coins.length).toBeLessThan(58);

    /* Spacing is DELIBERATELY varied (organic): realized gaps span a wide range, not one value. */
    const gaps = coins.slice(1).map((coin, i) => coin.position - coins[i].position);
    const spread = Math.max(...gaps) - Math.min(...gaps);
    expect(spread).toBeGreaterThan((COIN_MAX_GAP - COIN_MIN_GAP) * 0.6);

    /* Upper bound from the minimum spacing: even all-smallest gaps can't exceed this many coins. */
    const maxPossible =
      Math.ceil((RACE_DISTANCE - COIN_END_MARGIN - COIN_FIRST_MIN) / COIN_MIN_GAP) + 1;
    expect(coins.length).toBeLessThanOrEqual(maxPossible);
  });

  it('returns no coins for a track too short to hold one', () => {
    expect(buildRaceCoins(7, 100)).toEqual([]);
  });
});
