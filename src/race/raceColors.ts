// Stable, per-player car colours for Slipstream. With any number of online
// opponents the field needs distinct, glanceable colours that stay attached to a
// given player across snapshots, so each colour is a PURE function of the
// player's uid (a deterministic hash into a fixed palette). The local player is
// always the brand green, and the single bot keeps the classic accent red, so
// the existing one-on-one look is unchanged.

/** The local player's car colour (the app brand green). */
export const PLAYER_CAR_COLOR = 'var(--brand, #11815a)';

/** The vs-bot opponent's car colour (the classic accent red). */
export const BOT_CAR_COLOR = 'var(--accent, #ff5a4d)';

// A palette of vivid, mutually-distinct hues that deliberately AVOID green so no
// opponent is confused with the brand-green local player. With more opponents
// than palette entries the hash wraps, so colours can repeat at very high N
// (see the standings list, which always disambiguates by name).
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

// FNV-1a string hash -> unsigned 32-bit. Same helper style used across the app
// (leaderboards, racePhysics) so the derivation is stable across platforms.
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
