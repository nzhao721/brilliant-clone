/* Stable per-player car colours: each opponent colour hashes its uid into a fixed palette, so it stays attached across snapshots. Local player is brand green; bot is accent red. */

import { hashString } from './raceRandom';

/** The local player's car colour (the app brand green). */
export const PLAYER_CAR_COLOR = 'var(--brand, #11815a)';

/** The vs-bot opponent's car colour (the classic accent red). */
export const BOT_CAR_COLOR = 'var(--accent, #ff5a4d)';

/* Vivid, distinct non-green hues (green is the local player). Beyond palette size the hash wraps; standings disambiguate by name. */
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

/** A stable opponent car colour for `id` (uid), hashed into the palette. */
export function opponentCarColor(id: string): string {
  return OPPONENT_PALETTE[hashString(id) % OPPONENT_PALETTE.length];
}
