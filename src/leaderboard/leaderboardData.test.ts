import { describe, expect, it } from 'vitest';
import {
  buildCloudLeaderboard,
  buildRankedLeaderboard,
  currentUserEntryId,
  normalizeCloudLeaderboardEntry,
  resolveLeaderboardDisplayName,
  seededCompetitors,
  type LeaderboardEntry,
  type RankedLeaderboardEntry,
} from './leaderboardData';

const competitors: LeaderboardEntry[] = [
  { id: 'a', displayName: 'Alpha', xp: 300 },
  { id: 'b', displayName: 'Bravo', xp: 200 },
  { id: 'c', displayName: 'Charlie', xp: 100 },
];

describe('buildRankedLeaderboard', () => {
  it('ranks the signed-in user among the seeded competitors by XP (desc)', () => {
    const { entries, currentUserRank, currentUserOutsideTop } = buildRankedLeaderboard({
      currentUserXp: 500,
      currentUserName: 'Maya',
      competitors,
      topN: 3,
    });

    expect(entries.map((entry) => entry.displayName)).toEqual(['Maya', 'Alpha', 'Bravo']);
    expect(entries[0]).toMatchObject({ id: currentUserEntryId, rank: 1, isCurrentUser: true });
    expect(currentUserRank).toBe(1);
    // The viewer is already in the visible window, so there is no pinned row.
    expect(currentUserOutsideTop).toBeNull();
  });

  it('pins the viewer below the window when they rank outside the top-N', () => {
    const { entries, currentUserRank, currentUserOutsideTop } = buildRankedLeaderboard({
      currentUserXp: 150,
      currentUserName: 'Maya',
      competitors,
      topN: 2,
    });

    // Full order is Alpha(300), Bravo(200), Maya(150), Charlie(100) → Maya is 3rd.
    expect(entries.map((entry) => entry.displayName)).toEqual(['Alpha', 'Bravo']);
    expect(entries.some((entry) => entry.isCurrentUser)).toBe(false);
    expect(currentUserRank).toBe(3);
    expect(currentUserOutsideTop).toMatchObject({
      displayName: 'Maya',
      rank: 3,
      isCurrentUser: true,
    });
  });

  it('places a brand-new (0 XP) learner last', () => {
    const { currentUserRank, currentUserOutsideTop } = buildRankedLeaderboard({
      currentUserXp: 0,
      currentUserName: 'Newcomer',
      competitors,
      topN: 10,
    });

    expect(currentUserRank).toBe(competitors.length + 1);
    expect(currentUserOutsideTop).toBeNull(); // topN(10) covers all 4 entries
  });

  it('floors fractional XP and treats negatives as zero', () => {
    const { entries } = buildRankedLeaderboard({
      currentUserXp: 150.9,
      currentUserName: 'Maya',
      competitors,
      topN: 10,
    });

    const ownRow = entries.find((entry) => entry.isCurrentUser);
    expect(ownRow?.xp).toBe(150);

    const negative = buildRankedLeaderboard({
      currentUserXp: -50,
      currentUserName: 'Maya',
      competitors,
      topN: 10,
    });
    expect(negative.entries.find((entry) => entry.isCurrentUser)?.xp).toBe(0);
  });

  it('breaks XP ties by name for stable ordering', () => {
    const { entries } = buildRankedLeaderboard({
      currentUserXp: 200,
      currentUserName: 'Anna',
      competitors,
      topN: 10,
    });

    // Anna and Bravo are tied at 200; "Anna" sorts before "Bravo".
    const annaIndex = entries.findIndex((entry) => entry.displayName === 'Anna');
    const bravoIndex = entries.findIndex((entry) => entry.displayName === 'Bravo');
    expect(annaIndex).toBeLessThan(bravoIndex);
  });

  it('defaults to the seeded competitors when none are provided', () => {
    const { entries } = buildRankedLeaderboard({
      currentUserXp: 999999,
      currentUserName: 'Top Dog',
    });

    expect(entries[0]).toMatchObject({ displayName: 'Top Dog', rank: 1, isCurrentUser: true });
    // The rest of the visible window is drawn from the seeded local competitors.
    expect(entries[1].displayName).toBe(seededCompetitors[0].displayName);
  });
});

describe('resolveLeaderboardDisplayName', () => {
  it('prefers the trimmed account display name', () => {
    expect(
      resolveLeaderboardDisplayName({ displayName: '  Maya Johnson ', email: 'maya@example.com' }),
    ).toBe('Maya Johnson');
  });

  it('falls back to the email local part when no display name is set', () => {
    expect(resolveLeaderboardDisplayName({ displayName: null, email: 'gauss@example.com' })).toBe(
      'gauss',
    );
  });

  it('uses a neutral fallback when nothing identifies the user', () => {
    expect(resolveLeaderboardDisplayName({ displayName: '', email: '' })).toBe('You');
    expect(resolveLeaderboardDisplayName(null)).toBe('You');
  });
});

describe('normalizeCloudLeaderboardEntry', () => {
  it('normalizes a well-formed Firestore row (doc id becomes the entry id)', () => {
    expect(
      normalizeCloudLeaderboardEntry('uid-1', {
        uid: 'uid-1',
        displayName: '  Carl Gauss ',
        totalXp: 1234,
        updatedAt: { seconds: 1 },
      }),
    ).toEqual({ id: 'uid-1', displayName: 'Carl Gauss', xp: 1234 });
  });

  it('floors fractional XP and treats negatives / non-numbers / missing as zero', () => {
    expect(normalizeCloudLeaderboardEntry('u', { totalXp: 99.9 })?.xp).toBe(99);
    expect(normalizeCloudLeaderboardEntry('u', { totalXp: -5 })?.xp).toBe(0);
    expect(normalizeCloudLeaderboardEntry('u', { totalXp: 'nope' })?.xp).toBe(0);
    expect(normalizeCloudLeaderboardEntry('u', {})?.xp).toBe(0);
  });

  it('falls back to a neutral name for missing/invalid names and caps the length', () => {
    expect(normalizeCloudLeaderboardEntry('u', { displayName: '' })?.displayName).toBe('Learner');
    expect(normalizeCloudLeaderboardEntry('u', { displayName: 42 })?.displayName).toBe('Learner');
    expect(normalizeCloudLeaderboardEntry('u', {})?.displayName).toBe('Learner');
    expect(normalizeCloudLeaderboardEntry('u', { displayName: 'a'.repeat(200) })?.displayName).toHaveLength(
      80,
    );
  });

  it('returns null for an unusable (empty) uid and for non-object data', () => {
    expect(normalizeCloudLeaderboardEntry('', { displayName: 'X' })).toBeNull();
    // A missing/garbled data payload still yields a valid (defaulted) row.
    expect(normalizeCloudLeaderboardEntry('u', null)).toEqual({
      id: 'u',
      displayName: 'Learner',
      xp: 0,
    });
  });
});

describe('buildCloudLeaderboard', () => {
  const realEntries: LeaderboardEntry[] = [
    { id: 'u-alpha', displayName: 'Alpha', xp: 300 },
    { id: 'u-bravo', displayName: 'Bravo', xp: 200 },
    { id: 'u-charlie', displayName: 'Charlie', xp: 100 },
  ];

  const seededIds = new Set(seededCompetitors.map((seed) => seed.id));
  const seededNames = new Set(seededCompetitors.map((seed) => seed.displayName));

  // The deployed/cloud board must contain ONLY real users + the viewer — none of
  // the seeded (fake) competitors that the offline fallback uses may leak in.
  function expectNoSeededCompetitors(entries: RankedLeaderboardEntry[]): void {
    expect(entries.some((entry) => seededIds.has(entry.id))).toBe(false);
    expect(entries.some((entry) => seededNames.has(entry.displayName))).toBe(false);
  }

  it('ranks real Firestore entries together with the viewer (live local XP)', () => {
    const { entries, currentUserRank, currentUserOutsideTop } = buildCloudLeaderboard({
      realEntries,
      currentUserId: 'me',
      currentUserXp: 250,
      currentUserName: 'Maya',
      topN: 4,
    });

    // Full order: Alpha(300), Maya(250), Bravo(200), Charlie(100).
    expect(entries.map((entry) => entry.displayName)).toEqual(['Alpha', 'Maya', 'Bravo', 'Charlie']);
    expect(entries[1]).toMatchObject({ id: currentUserEntryId, rank: 2, isCurrentUser: true });
    expect(currentUserRank).toBe(2);
    expect(currentUserOutsideTop).toBeNull();
    expectNoSeededCompetitors(entries);
  });

  it("drops the viewer's stale cloud row in favor of their live local XP", () => {
    const { entries, currentUserRank } = buildCloudLeaderboard({
      realEntries: [
        { id: 'me', displayName: 'Maya (stale)', xp: 50 },
        { id: 'u-alpha', displayName: 'Alpha', xp: 300 },
      ],
      currentUserId: 'me',
      currentUserXp: 400,
      currentUserName: 'Maya',
      topN: 10,
    });

    // The stale cloud 'me' row is removed; the viewer's live 400 XP wins.
    expect(entries).toHaveLength(2);
    expect(entries.some((entry) => entry.displayName === 'Maya (stale)')).toBe(false);
    expect(entries[0]).toMatchObject({ id: currentUserEntryId, isCurrentUser: true, xp: 400 });
    expect(currentUserRank).toBe(1);
    expectNoSeededCompetitors(entries);
  });

  it('dedupes duplicate real ids and normalizes XP (floor / negatives→0)', () => {
    const { entries } = buildCloudLeaderboard({
      realEntries: [
        { id: 'dup', displayName: 'First', xp: 150.9 },
        { id: 'dup', displayName: 'Second', xp: 999 },
      ],
      currentUserId: 'me',
      currentUserXp: -5,
      currentUserName: 'Maya',
      topN: 10,
    });

    const dupRows = entries.filter((entry) => entry.id === 'dup');
    expect(dupRows).toHaveLength(1);
    expect(dupRows[0]).toMatchObject({ displayName: 'First', xp: 150 });
    expect(entries.find((entry) => entry.isCurrentUser)?.xp).toBe(0);
  });

  it('never tops up a sparse board with seeded competitors', () => {
    const { entries, currentUserRank, currentUserOutsideTop } = buildCloudLeaderboard({
      realEntries: [{ id: 'u-alpha', displayName: 'Alpha', xp: 10 }],
      currentUserId: 'me',
      currentUserXp: 5,
      currentUserName: 'Maya',
      topN: 10,
    });

    // Real(1) + viewer(1) = 2; the remaining 8 slots stay EMPTY — no fakes.
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.displayName)).toEqual(['Alpha', 'Maya']);
    expect(currentUserRank).toBe(2);
    expect(currentUserOutsideTop).toBeNull();
    expectNoSeededCompetitors(entries);
  });

  it('ranks a large real board into the top-N window with no seeded fill', () => {
    const manyReal: LeaderboardEntry[] = Array.from({ length: 6 }, (_unused, index) => ({
      id: `u-${index}`,
      displayName: `User ${index}`,
      xp: (index + 1) * 100,
    }));

    const { entries, currentUserRank } = buildCloudLeaderboard({
      realEntries: manyReal,
      currentUserId: 'me',
      currentUserXp: 1000,
      currentUserName: 'Maya',
      topN: 5,
    });

    // Real(6) + viewer(1) = 7 → only the top 5 by XP show, all real, no fakes.
    // Maya(1000) tops everyone (the strongest real user is User 5 at 600 XP).
    expect(entries).toHaveLength(5);
    expect(entries[0]).toMatchObject({ id: currentUserEntryId, rank: 1, isCurrentUser: true });
    expect(currentUserRank).toBe(1);
    expectNoSeededCompetitors(entries);
  });

  it('pins the viewer below the window when they rank outside the top-N', () => {
    const { entries, currentUserRank, currentUserOutsideTop } = buildCloudLeaderboard({
      realEntries,
      currentUserId: 'me',
      currentUserXp: 50,
      currentUserName: 'Maya',
      topN: 2,
    });

    // Order: Alpha(300), Bravo(200), Charlie(100), Maya(50) → Maya is 4th.
    expect(entries.map((entry) => entry.displayName)).toEqual(['Alpha', 'Bravo']);
    expect(entries.some((entry) => entry.isCurrentUser)).toBe(false);
    expect(currentUserRank).toBe(4);
    expect(currentUserOutsideTop).toMatchObject({
      displayName: 'Maya',
      rank: 4,
      isCurrentUser: true,
    });
    expectNoSeededCompetitors(entries);
  });

  it('shows ONLY the viewer for a brand-new board with no other real users', () => {
    const { entries, currentUserRank, currentUserOutsideTop } = buildCloudLeaderboard({
      realEntries: [],
      currentUserId: 'me',
      currentUserXp: 0,
      currentUserName: 'Newcomer',
      // default topN (10): an empty production board correctly shows just the viewer.
    });

    // No real competitors and no seeded fill → the viewer is the entire board.
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: currentUserEntryId,
      displayName: 'Newcomer',
      rank: 1,
      isCurrentUser: true,
    });
    expect(currentUserRank).toBe(1);
    expect(currentUserOutsideTop).toBeNull();
    expectNoSeededCompetitors(entries);
  });
});
