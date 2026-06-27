/**
 * Single source of truth for the XP -> level curve (dashboard + analytics share
 * it). Level 1 starts at 0 XP; advancing FROM a level costs `xpLevelStep` more
 * than the previous, so levels get progressively more expensive
 * (getXpForLevel(n) = xpBasePerLevel + (n - 1) * xpLevelStep).
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

/** XP to advance FROM `level` to the next; grows by `xpLevelStep` each level. */
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

  /* Walk up the curve, subtracting each level's (increasing) cost until the
   * remaining XP no longer fills the current level. */
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
