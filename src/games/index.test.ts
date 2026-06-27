import { beforeEach, describe, expect, it } from 'vitest';
import {
  arcadeHighScoreStorageKey,
  arcadeHighScoreStorageKeyPrefix,
  games,
  readArcadeHighScore,
  resetGameHighScores,
  saveArcadeHighScore,
} from './index';

beforeEach(() => {
  window.localStorage.clear();
});

describe('resetGameHighScores', () => {
  it('removes the stored high score for every registered game', () => {
    // Seed a best for each game in the registry.
    for (const game of games) {
      saveArcadeHighScore(game.id, 100);
      expect(readArcadeHighScore(game.id)).toBe(100);
    }

    resetGameHighScores();

    // Every per-game key is gone and reads back as 0.
    for (const game of games) {
      expect(readArcadeHighScore(game.id)).toBe(0);
      expect(window.localStorage.getItem(arcadeHighScoreStorageKey(game.id))).toBeNull();
    }
  });

  it('sweeps prefixed entries left by games no longer in the registry', () => {
    const retiredKey = `${arcadeHighScoreStorageKeyPrefix}retired-game`;
    window.localStorage.setItem(retiredKey, '42');
    // An unrelated key must survive the sweep untouched.
    window.localStorage.setItem('brilliant-clone.completed-lessons', '["x"]');

    resetGameHighScores();

    expect(window.localStorage.getItem(retiredKey)).toBeNull();
    expect(window.localStorage.getItem('brilliant-clone.completed-lessons')).toBe('["x"]');
  });

  it('is a no-op when there are no high scores stored', () => {
    expect(() => resetGameHighScores()).not.toThrow();

    for (const game of games) {
      expect(readArcadeHighScore(game.id)).toBe(0);
    }
  });
});

describe('games registry', () => {
  it('brands the 3x3 merge game by its 256 win tile while keeping a stable id', () => {
    // Display-only rename: the card/header now read "256" (the variant's real
    // win tile), but the id stays '2048' so saved high scores, leaderboards, and
    // localStorage keys are untouched by the rebrand.
    const game = games.find((entry) => entry.id === '2048');
    expect(game).toBeDefined();
    expect(game?.name).toBe('256');
    expect(arcadeHighScoreStorageKey('2048')).toBe(`${arcadeHighScoreStorageKeyPrefix}2048`);
  });
});
