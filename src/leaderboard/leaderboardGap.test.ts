import { describe, expect, it } from 'vitest';
import type { RankedLeaderboardEntry } from './leaderboardData';
import { computeLeaderboardGapMessage } from './leaderboardGap';

/* Builds a ranked row. `rank` is irrelevant to the helper (it reads array order,
 * which is the contiguous ranked window), so it is left at 0 for brevity. */
function entry(
  id: string,
  xp: number,
  options: { displayName?: string; isCurrentUser?: boolean } = {},
): RankedLeaderboardEntry {
  return {
    id,
    xp,
    displayName: options.displayName ?? id,
    rank: 0,
    isCurrentUser: options.isCurrentUser ?? false,
  };
}

describe('computeLeaderboardGapMessage', () => {
  it('frames the catch-up to the person just above (default when ahead is reachable)', () => {
    const entries = [
      entry('a', 500, { displayName: 'Alpha' }),
      entry('me', 460, { displayName: 'Maya', isCurrentUser: true }),
      entry('b', 100, { displayName: 'Bravo' }),
    ];

    expect(computeLeaderboardGapMessage(entries, 'me')).toEqual({
      text: "You're only 40 XP behind Alpha — one good session and you pass them!",
    });
  });

  it('frames catch-up when the viewer is last in the window (only someone above)', () => {
    const entries = [
      entry('a', 500, { displayName: 'Alpha' }),
      entry('me', 450, { displayName: 'Maya', isCurrentUser: true }),
    ];

    expect(computeLeaderboardGapMessage(entries, 'me')).toEqual({
      text: "You're only 50 XP behind Alpha — one good session and you pass them!",
    });
  });

  it('frames the DEFEND of #1 when the viewer leads and someone is behind', () => {
    const entries = [
      entry('me', 500, { displayName: 'Maya', isCurrentUser: true }),
      entry('b', 480, { displayName: 'Bravo' }),
    ];

    expect(computeLeaderboardGapMessage(entries, 'me')).toEqual({
      text: 'Bravo is creeping up — just 20 XP behind you. Keep going to hold #1!',
    });
  });

  it('prefers DEFEND when the chaser behind is strictly closer than the target ahead', () => {
    const entries = [
      entry('a', 500, { displayName: 'Alpha' }),
      entry('me', 450, { displayName: 'Maya', isCurrentUser: true }), // gapAbove 50
      entry('b', 445, { displayName: 'Bravo' }), // gapBelow 5 (closer)
    ];

    expect(computeLeaderboardGapMessage(entries, 'me')).toEqual({
      text: 'Bravo is right on your tail — only 5 XP back. Keep studying to defend your spot!',
    });
  });

  it('stays on catch-up when the gaps are equal (behind is not strictly closer)', () => {
    const entries = [
      entry('a', 500, { displayName: 'Alpha' }),
      entry('me', 450, { displayName: 'Maya', isCurrentUser: true }), // gapAbove 50
      entry('b', 400, { displayName: 'Bravo' }), // gapBelow 50 (tie, not closer)
    ];

    expect(computeLeaderboardGapMessage(entries, 'me')).toEqual({
      text: "You're only 50 XP behind Alpha — one good session and you pass them!",
    });
  });

  it('uses the tie line when the person just above is level with the viewer', () => {
    const entries = [
      entry('a', 450, { displayName: 'Alpha' }),
      entry('me', 450, { displayName: 'Maya', isCurrentUser: true }), // gapAbove 0
      entry('b', 100, { displayName: 'Bravo' }),
    ];

    expect(computeLeaderboardGapMessage(entries, 'me')).toEqual({
      text: "You're tied with Alpha — pull ahead before they do!",
    });
  });

  it('uses the tie line when the chaser behind is level with the #1 viewer', () => {
    const entries = [
      entry('me', 300, { displayName: 'Maya', isCurrentUser: true }),
      entry('b', 300, { displayName: 'Bravo' }), // gapBelow 0
    ];

    expect(computeLeaderboardGapMessage(entries, 'me')).toEqual({
      text: "You're tied with Bravo — pull ahead before they do!",
    });
  });

  it('lets a level chaser behind win over a distant target ahead (tie line)', () => {
    const entries = [
      entry('a', 500, { displayName: 'Alpha' }), // gapAbove 200
      entry('me', 300, { displayName: 'Maya', isCurrentUser: true }),
      entry('b', 300, { displayName: 'Bravo' }), // gapBelow 0 (closer → defend → tie)
    ];

    expect(computeLeaderboardGapMessage(entries, 'me')).toEqual({
      text: "You're tied with Bravo — pull ahead before they do!",
    });
  });

  it('identifies the viewer by uid when the row is not flagged isCurrentUser', () => {
    const entries = [
      entry('a', 500, { displayName: 'Alpha' }),
      entry('me', 450, { displayName: 'Maya' }), // no isCurrentUser flag
      entry('b', 100, { displayName: 'Bravo' }),
    ];

    expect(computeLeaderboardGapMessage(entries, 'me')).toEqual({
      text: "You're only 50 XP behind Alpha — one good session and you pass them!",
    });
  });

  it('falls back to a neutral name when a neighbor has no display name', () => {
    const entries = [
      entry('a', 500, { displayName: '   ' }),
      entry('me', 450, { displayName: 'Maya', isCurrentUser: true }),
    ];

    expect(computeLeaderboardGapMessage(entries, 'me')).toEqual({
      text: "You're only 50 XP behind the next learner — one good session and you pass them!",
    });
  });

  it('hides (returns null) when the viewer is alone on the board', () => {
    const entries = [entry('me', 120, { displayName: 'Maya', isCurrentUser: true })];
    expect(computeLeaderboardGapMessage(entries, 'me')).toBeNull();
  });

  it('hides (returns null) for an empty board', () => {
    expect(computeLeaderboardGapMessage([], 'me')).toBeNull();
  });

  it('hides (returns null) when the viewer is not in the window', () => {
    const entries = [
      entry('a', 500, { displayName: 'Alpha' }),
      entry('b', 400, { displayName: 'Bravo' }),
    ];
    expect(computeLeaderboardGapMessage(entries, 'me')).toBeNull();
  });
});
