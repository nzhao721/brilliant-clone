/*
 * Leaderboard ranking + data shaping. PURE (no Firebase imports) so it stays
 * unit-testable. Two boards:
 *   • buildRankedLeaderboard — local-only: the viewer's XP vs. seeded competitors
 *     (the fallback when Firestore is unavailable).
 *   • buildCloudLeaderboard — the real cross-user board: live Firestore entries +
 *     the viewer's own LIVE XP, showing ONLY real users.
 */

export type LeaderboardEntry = {
  id: string;
  displayName: string;
  xp: number;
};

export type RankedLeaderboardEntry = LeaderboardEntry & {
  rank: number;
  isCurrentUser: boolean;
};

// Stable id for the synthesized row representing the signed-in viewer.
export const currentUserEntryId = '__current-user__';

/* How many ranked rows the board surfaces; the viewer is pinned separately when
 * outside this window. */
export const leaderboardTopN = 10;

const maxDisplayNameLength = 80;

/* Seeded local competitors so the board looks believable offline; XP spans a wide
 * range so the viewer lands somewhere sensible. */
export const seededCompetitors: LeaderboardEntry[] = [
  { id: 'seed-aria', displayName: 'Aria Khanna', xp: 4820 },
  { id: 'seed-mateo', displayName: 'Mateo Rossi', xp: 4310 },
  { id: 'seed-lena', displayName: 'Lena Fischer', xp: 3975 },
  { id: 'seed-jamal', displayName: 'Jamal Carter', xp: 3540 },
  { id: 'seed-yuki', displayName: 'Yuki Tanaka', xp: 3120 },
  { id: 'seed-sofia', displayName: 'Sofia Alvarez', xp: 2760 },
  { id: 'seed-omar', displayName: 'Omar Haddad', xp: 2390 },
  { id: 'seed-priya', displayName: 'Priya Nair', xp: 1980 },
  { id: 'seed-noah', displayName: 'Noah Bergström', xp: 1605 },
  { id: 'seed-mia', displayName: 'Mia Laurent', xp: 1240 },
  { id: 'seed-kofi', displayName: 'Kofi Mensah', xp: 870 },
  { id: 'seed-elif', displayName: 'Elif Demir', xp: 520 },
  { id: 'seed-sam', displayName: 'Sam Rivera', xp: 240 },
  { id: 'seed-leo', displayName: 'Leo Park', xp: 90 },
];

type DisplayUser = {
  displayName?: string | null;
  email?: string | null;
};

/**
 * Name shown for the viewer: account display name, then the email's local part,
 * then a neutral fallback. Local-only, no network.
 */
export function resolveLeaderboardDisplayName(user: DisplayUser | null | undefined): string {
  const displayName = user?.displayName?.trim();
  if (displayName) {
    return displayName.slice(0, maxDisplayNameLength);
  }

  const emailName = user?.email?.split('@')[0]?.trim();
  if (emailName) {
    return emailName.slice(0, maxDisplayNameLength);
  }

  return 'You';
}

function normalizeXp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

export type BuildLeaderboardOptions = {
  currentUserXp: number;
  currentUserName: string;
  topN?: number;
  competitors?: LeaderboardEntry[];
};

export type BuiltLeaderboard = {
  /** The ranked top-N rows (highest XP first). */
  entries: RankedLeaderboardEntry[];
  /** The viewer's 1-based rank across the whole field. */
  currentUserRank: number;
  /** The viewer's row when they fall outside the top-N window, else null. */
  currentUserOutsideTop: RankedLeaderboardEntry | null;
};

/**
 * Sorts the field (highest XP first, ties by name), assigns 1-based ranks, and
 * pins the viewer's row (identified by `currentUserEntryId`, assumed present).
 * Pure; shared by both boards below.
 */
function rankLeaderboardField(field: LeaderboardEntry[], topN: number): BuiltLeaderboard {
  const ranked: RankedLeaderboardEntry[] = field
    .map((entry) => ({ ...entry, xp: normalizeXp(entry.xp) }))
    .sort((left, right) => right.xp - left.xp || left.displayName.localeCompare(right.displayName))
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
      isCurrentUser: entry.id === currentUserEntryId,
    }));

  const currentUserRanked =
    ranked.find((entry) => entry.isCurrentUser) ?? null;

  const entries = ranked.slice(0, topN);
  const currentUserInTop = entries.some((entry) => entry.isCurrentUser);

  return {
    entries,
    currentUserRank: currentUserRanked ? currentUserRanked.rank : ranked.length,
    currentUserOutsideTop:
      currentUserRanked && !currentUserInTop ? currentUserRanked : null,
  };
}

/**
 * Ranks the viewer against the seeded competitors — the local-only fallback when
 * Firestore is unavailable. Pure and deterministic.
 */
export function buildRankedLeaderboard({
  currentUserXp,
  currentUserName,
  topN = leaderboardTopN,
  competitors = seededCompetitors,
}: BuildLeaderboardOptions): BuiltLeaderboard {
  const currentEntry: LeaderboardEntry = {
    id: currentUserEntryId,
    displayName: currentUserName,
    xp: normalizeXp(currentUserXp),
  };

  return rankLeaderboardField([...competitors, currentEntry], topN);
}

/**
 * Normalizes one Firestore `leaderboard/{uid}` row into a `LeaderboardEntry`: id
 * is the uid; `totalXp` floored/clamped non-negative; `displayName` trimmed,
 * capped, neutral fallback. Returns `null` for an empty uid. Pure.
 */
export function normalizeCloudLeaderboardEntry(
  uid: string,
  data: unknown,
): LeaderboardEntry | null {
  if (typeof uid !== 'string' || !uid) {
    return null;
  }

  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const rawName = typeof record.displayName === 'string' ? record.displayName.trim() : '';
  const displayName = (rawName || 'Learner').slice(0, maxDisplayNameLength);
  const xp = normalizeXp(typeof record.totalXp === 'number' ? record.totalXp : 0);

  return { id: uid, displayName, xp };
}

export type BuildCloudLeaderboardOptions = {
  /** Real rows from Firestore (id === each user's uid). */
  realEntries: LeaderboardEntry[];
  /** The viewer's uid, used to drop their (possibly stale) cloud row. */
  currentUserId: string | null;
  /** The viewer's LIVE local XP — authoritative for their own row. */
  currentUserXp: number;
  currentUserName: string;
  topN?: number;
};

/**
 * Builds the real cross-user board: Firestore rows + the viewer's own live XP (a
 * synthesized row replaces their possibly-stale cloud row), deduped by id. ONLY
 * real users + the viewer — never the seeded competitors. Pure and deterministic.
 */
export function buildCloudLeaderboard({
  realEntries,
  currentUserId,
  currentUserXp,
  currentUserName,
  topN = leaderboardTopN,
}: BuildCloudLeaderboardOptions): BuiltLeaderboard {
  const currentEntry: LeaderboardEntry = {
    id: currentUserEntryId,
    displayName: currentUserName,
    xp: normalizeXp(currentUserXp),
  };

  /* The viewer is always `currentEntry`; reserve the sentinel id + their real uid
   * so a stale cloud row can't duplicate them. */
  const seenIds = new Set<string>([currentUserEntryId]);
  if (currentUserId) {
    seenIds.add(currentUserId);
  }

  const field: LeaderboardEntry[] = [currentEntry];

  for (const entry of realEntries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || seenIds.has(entry.id)) {
      continue;
    }

    seenIds.add(entry.id);
    field.push({ id: entry.id, displayName: entry.displayName, xp: normalizeXp(entry.xp) });
  }

  return rankLeaderboardField(field, topN);
}
