/*
 * Small, dependency-free calendar-day helpers shared by the streak, spaced
 * repetition, and daily-gate logic. Days are UTC day indices so diffs are exact
 * and DST-safe; date keys are `YYYY-MM-DD` strings (see getTodayKey).
 *
 * IMPORTANT — local vs UTC: a date KEY always denotes a LOCAL calendar day
 * (getTodayKey formats the local Y/M/D), and dateKeyToDayNumber merely encodes that
 * key as a stable integer (its internal Date.UTC use is just the encoding, not a
 * timezone choice). So any day key derived from a stored instant must use the
 * LOCAL day of that instant (isoToLocalDateKey) to stay on the same basis as
 * "today" — using the UTC date slice instead is off by a day for evening
 * completions in negative offsets (e.g. UTC-7).
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

/**
 * The LOCAL calendar day (`YYYY-MM-DD`) of an ISO instant, formatted exactly like
 * getTodayKey (local getFullYear/getMonth/getDate). Use this — never `iso.slice(0,
 * 10)`, which is the UTC date — when bucketing a stored timestamp into the same
 * day basis as "today". Returns null for a missing/invalid timestamp.
 */
export function isoToLocalDateKey(iso: string): string | null {
  const date = new Date(typeof iso === 'string' ? iso : '');
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
