/*
 * Dashboard "rank urgency" nudge. PURE (no React/Firebase imports) so the
 * wording + selection logic stay unit-testable without rendering.
 *
 * Given a CONTIGUOUS ranked window (consecutive ranks, highest XP first — exactly
 * what `useLeaderboard`/`useClassLeaderboard` return as `entries`) it finds the
 * viewer and crafts ONE punchy line about the closest neighbor: either how little
 * XP separates them from the person just ABOVE (catch-up) or how close the person
 * just BEHIND is (defend). Returns `null` whenever there is nothing motivating to
 * say (viewer absent from the window, alone, or no neighbors) so the caller can
 * simply render nothing.
 */

import type { RankedLeaderboardEntry } from './leaderboardData';

export type LeaderboardGapMessage = {
  /** One ready-to-render, urgency-framed line. */
  text: string;
};

/* Shown when a neighbor's name is missing/blank so the line never reads awkwardly. */
const nameFallback = 'the next learner';

function entryName(entry: RankedLeaderboardEntry): string {
  const name = typeof entry.displayName === 'string' ? entry.displayName.trim() : '';
  return name || nameFallback;
}

/* Gaps are XP counts: clamp to a non-negative integer and group thousands so the
 * line matches the dashboard's other XP figures (e.g. "1,250"). */
function formatGap(gap: number): string {
  const safe = Number.isFinite(gap) ? Math.max(0, Math.round(gap)) : 0;
  return safe.toLocaleString();
}

function catchUpText(name: string, gap: number): string {
  return `You're only ${formatGap(gap)} XP behind ${name} — one good session and you pass them!`;
}

/* Viewer is #1: someone is closing in, so rally them to defend the top spot. */
function defendTopText(name: string, gap: number): string {
  return `${name} is creeping up — just ${formatGap(gap)} XP behind you. Keep going to hold #1!`;
}

/* Viewer is mid-board but the chaser behind is closer than the target ahead. */
function defendMidText(name: string, gap: number): string {
  return `${name} is right on your tail — only ${formatGap(gap)} XP back. Keep studying to defend your spot!`;
}

function tieText(name: string): string {
  return `You're tied with ${name} — pull ahead before they do!`;
}

/**
 * Picks the single most urgent line for the viewer's leaderboard standing.
 *
 * Selection:
 *   • Viewer #1 with a chaser behind  → DEFEND ("hold #1").
 *   • Chaser behind is STRICTLY closer than the person ahead → DEFEND ("defend your spot").
 *   • Otherwise, if someone is ahead → CATCH-UP ("one good session and you pass them").
 *   • Whichever side is chosen, a 0-XP gap becomes a TIE line.
 *
 * Returns `null` (render nothing) when `entries` is empty/single, the viewer is
 * not in this window, or the viewer has no neighbor to compare against.
 *
 * @param entries  A contiguous ranked window (consecutive ranks, XP desc).
 * @param currentUid  The viewer's uid; the viewer is matched by `isCurrentUser`
 *                    first, falling back to `id === currentUid`.
 */
export function computeLeaderboardGapMessage(
  entries: RankedLeaderboardEntry[],
  currentUid: string | null,
): LeaderboardGapMessage | null {
  if (!Array.isArray(entries) || entries.length < 2) {
    return null;
  }

  const index = entries.findIndex(
    (entry) =>
      Boolean(entry) && (entry.isCurrentUser || (currentUid != null && entry.id === currentUid)),
  );
  if (index === -1) {
    return null;
  }

  const user = entries[index];
  const above = index > 0 ? entries[index - 1] : null;
  const below = index < entries.length - 1 ? entries[index + 1] : null;
  if (!above && !below) {
    return null;
  }

  const gapAbove = above ? Math.max(0, above.xp - user.xp) : null;
  const gapBelow = below ? Math.max(0, user.xp - below.xp) : null;

  /* Defend when the viewer leads (no one above) or the chaser behind is strictly
   * closer than the person ahead — both make the more urgent story. */
  const preferDefend =
    below != null &&
    gapBelow != null &&
    (above == null || gapAbove == null || gapBelow < gapAbove);

  if (preferDefend && below != null && gapBelow != null) {
    const name = entryName(below);
    if (gapBelow === 0) {
      return { text: tieText(name) };
    }
    return { text: above == null ? defendTopText(name, gapBelow) : defendMidText(name, gapBelow) };
  }

  if (above != null && gapAbove != null) {
    const name = entryName(above);
    if (gapAbove === 0) {
      return { text: tieText(name) };
    }
    return { text: catchUpText(name, gapAbove) };
  }

  return null;
}
