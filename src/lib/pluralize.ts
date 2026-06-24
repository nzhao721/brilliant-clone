/**
 * Formats a count with its unit noun, using the singular form only when the
 * count is exactly 1. Pass an explicit `plural` for irregular nouns.
 *
 * pluralize(1, 'day')  // "1 day"
 * pluralize(3, 'day')  // "3 days"
 * pluralize(0, 'day')  // "0 days"
 */
export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
