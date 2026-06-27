/**
 * Formats a count with its unit noun, singular only when the count is exactly 1.
 * Pass an explicit `plural` for irregular nouns. E.g. pluralize(3, 'day') → "3 days".
 */
export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
