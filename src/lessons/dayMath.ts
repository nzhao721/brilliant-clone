/*
 * Small, dependency-free calendar-day helpers shared by the streak, spaced
 * repetition, and daily-gate logic. Days are UTC day indices so diffs are exact
 * and DST-safe; date keys are `YYYY-MM-DD` strings (see getTodayKey).
 */

/** Converts a `YYYY-MM-DD` key to a UTC day index (DST-safe, exact day diffs). */
export function dateKeyToDayNumber(dateKey: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof dateKey === 'string' ? dateKey : '');
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);

  return Number.isNaN(utc) ? null : Math.floor(utc / 86_400_000);
}

/** Inverse of {@link dateKeyToDayNumber}: a UTC day index back to a `YYYY-MM-DD` key. */
export function dayNumberToDateKey(dayNumber: number): string | null {
  if (!Number.isFinite(dayNumber)) {
    return null;
  }

  const date = new Date(Math.round(dayNumber) * 86_400_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
