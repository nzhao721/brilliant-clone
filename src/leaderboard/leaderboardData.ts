// Leaderboard ranking + data shaping. This module is intentionally PURE (no
// Firebase/network imports) so it stays trivially unit-testable and safe to run
// while Firebase is disabled (e.g. in tests). Two boards are produced here:
//
//   • buildRankedLeaderboard — the local-only board: the signed-in viewer's XP
//     (from the on-device progress store) ranked against a fixed set of seeded
//     competitors. Used as the graceful fallback when Firestore is unavailable.
//   • buildCloudLeaderboard — the real cross-user board: live entries fetched
//     from Firestore (see ../leaderboard/leaderboardFirestore) merged with the
//     viewer's own LIVE local XP (so their row is never stale). This board shows
//     ONLY real users — never the seeded competitors — so the deployed app stays
//     truthful even when sparse (a brand-new board may show just the viewer).

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

// How many ranked rows the board surfaces at once. The viewer is pinned below
// the list separately when they fall outside this window.
export const leaderboardTopN = 10;

const maxDisplayNameLength = 80;

// Seeded local competitors so the board shows a believable ranking offline. XP
// values are spread across a wide range so the signed-in user lands somewhere
// sensible whether they're just starting or far along.
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
 * Picks the name shown for the signed-in viewer: the account display name, then
 * the email's local part, then a neutral fallback. Reads only local identity,
 * no network.
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
 * Sorts the supplied field (highest XP first, ties broken by name for a stable
 * order), assigns 1-based ranks, and pins the viewer's row. The viewer is
 * identified by the sentinel `currentUserEntryId` and is assumed to be present
 * in `field`. Pure and deterministic. Shared by both boards below.
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
 * Merges the signed-in viewer with the seeded competitors and produces a ranked
 * board. Pure and deterministic: ties break by name so ordering is stable. This
 * is the local-only fallback used when Firestore is unavailable.
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
 * Normalizes one row loaded from the Firestore `leaderboard/{uid}` collection
 * into a `LeaderboardEntry`. Defensive (mirrors the firestoreProgress/raceMatch
 * normalizers): the document id is the uid; `totalXp` is floored/clamped to a
 * non-negative integer; `displayName` is trimmed, length-capped, and falls back
 * to a neutral label when absent. Returns `null` for an unusable (empty) uid so
 * callers can filter it out. Pure: no Firebase import.
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
 * Builds the real cross-user board from Firestore rows merged with the viewer's
 * own live local XP. The viewer's cloud row (if any) is dropped in favor of a
 * synthesized row carrying their live XP so it's never stale. Rows are deduped
 * by id. This board is composed ONLY of real users plus the viewer — it never
 * tops up with the seeded (fake) competitors — so the deployed app shows a
 * truthful ranking. A brand-new board with no other real users correctly shows
 * just the viewer. Pure and deterministic.
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

  // The viewer is always represented by `currentEntry`; reserve both the
  // sentinel id and the viewer's real uid so a stale cloud row can't duplicate
  // them.
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
