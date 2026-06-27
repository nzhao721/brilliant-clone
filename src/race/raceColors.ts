// Stable, per-player car colours for Slipstream: each opponent colour is a PURE
// function of the player's uid (a hash into a fixed palette) so it stays attached
// across snapshots. The local player is always brand green; the bot is accent red.

/** The local player's car colour (the app brand green). */
export const PLAYER_CAR_COLOR = 'var(--brand, #11815a)';

/** The vs-bot opponent's car colour (the classic accent red). */
export const BOT_CAR_COLOR = 'var(--accent, #ff5a4d)';

// Vivid, mutually-distinct hues that AVOID green (so no opponent is confused with
// the local player). Beyond palette size the hash wraps; the standings list always
// disambiguates by name.
const OPPONENT_PALETTE = [
  '#ff5a4d', // red
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#0ea5e9', // sky
  '#ec4899', // pink
  '#6366f1', // indigo
  '#f97316', // orange
  '#a855f7', // purple
  '#e11d48', // rose
  '#06b6d4', // cyan
  '#d946ef', // fuchsia
  '#eab308', // yellow
];

// FNV-1a string hash -> unsigned 32-bit (same helper used across the app).
function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** A stable opponent car colour for `id` (uid), hashed into the palette. */
export function opponentCarColor(id: string): string {
  return OPPONENT_PALETTE[hashString(id) % OPPONENT_PALETTE.length];
}
