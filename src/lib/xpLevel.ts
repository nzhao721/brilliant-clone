/**
 * Single source of truth for the XP -> level curve. Both the dashboard and the
 * analytics page read levels from here so the two surfaces never drift apart.
 *
 * Level 1 starts at 0 XP. Advancing FROM a level costs `xpLevelStep` more XP
 * than advancing from the previous one, so each successive level is
 * progressively more expensive:
 *
 *   Level 1 -> 2 costs 250 XP, 2 -> 3 costs 400, 3 -> 4 costs 550, ...
 *   (getXpForLevel(n) = xpBasePerLevel + (n - 1) * xpLevelStep)
 *
 * These costs were raised from the original 100 base / +50 step curve to this
 * steeper 250 base / +150 step curve, so every level now requires strictly more
 * XP to reach than it used to.
 */
export const xpBasePerLevel = 250;
export const xpLevelStep = 150;

export type XpLevel = {
  /** Current level (always >= 1). */
  level: number;
  /** XP banked INTO the current level (0 at the moment the level begins). */
  xpIntoLevel: number;
  /** Total XP span of the current level (the cost to reach the next one). */
  xpForLevel: number;
  /** XP still required to reach the next level. */
  xpToNextLevel: number;
  /** Cumulative total XP at which the current level began. */
  currentLevelFloor: number;
  /** Cumulative total XP at which the next level begins. */
  nextLevelThreshold: number;
  /** Fraction (0..1) of the way through the current level. */
  progress: number;
};

/**
 * XP required to advance FROM `level` to the next one. Grows by `xpLevelStep`
 * each level: Level 1 -> 2 = 250 XP, 2 -> 3 = 400, 3 -> 4 = 550, ...
 */
export function getXpForLevel(level: number): number {
  const safeLevel = Number.isFinite(level) && level > 1 ? Math.floor(level) : 1;
  return xpBasePerLevel + (safeLevel - 1) * xpLevelStep;
}

/** Maps total XP onto the progressive leveling curve (Level 1 starts at 0 XP). */
export function getXpLevel(totalXp: number): XpLevel {
  const safeXp = Number.isFinite(totalXp) && totalXp > 0 ? Math.floor(totalXp) : 0;

  let level = 1;
  let currentLevelFloor = 0;
  let xpIntoLevel = safeXp;
  let xpForLevel = getXpForLevel(level);

  // Walk up the curve, subtracting each level's (increasing) cost until the
  // remaining XP no longer fills the current level.
  while (xpIntoLevel >= xpForLevel) {
    xpIntoLevel -= xpForLevel;
    currentLevelFloor += xpForLevel;
    level += 1;
    xpForLevel = getXpForLevel(level);
  }

  return {
    level,
    xpIntoLevel,
    xpForLevel,
    xpToNextLevel: xpForLevel - xpIntoLevel,
    currentLevelFloor,
    nextLevelThreshold: currentLevelFloor + xpForLevel,
    progress: xpForLevel > 0 ? xpIntoLevel / xpForLevel : 0,
  };
}
