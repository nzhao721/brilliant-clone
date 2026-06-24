import { describe, expect, it } from 'vitest';
import { pluralize } from './pluralize';

describe('pluralize', () => {
  it('uses the singular form only for a count of 1', () => {
    expect(pluralize(1, 'day')).toBe('1 day');
    expect(pluralize(0, 'day')).toBe('0 days');
    expect(pluralize(2, 'day')).toBe('2 days');
  });

  it('pluralizes multi-word nouns by appending s', () => {
    expect(pluralize(1, 'unlocked question')).toBe('1 unlocked question');
    expect(pluralize(5, 'unlocked question')).toBe('5 unlocked questions');
  });

  it('supports an explicit irregular plural', () => {
    expect(pluralize(1, 'try', 'tries')).toBe('1 try');
    expect(pluralize(3, 'try', 'tries')).toBe('3 tries');
  });
});
