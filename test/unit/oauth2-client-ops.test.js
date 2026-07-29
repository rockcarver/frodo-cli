import { formatOptionalStringArray } from '../../src/ops/utils/ArrayFormat.js';

describe('OAuth2ClientOps - formatOptionalStringArray()', () => {
  test('returns empty string for undefined', () => {
    expect(formatOptionalStringArray(undefined)).toBe('');
  });

  test('returns empty string for null', () => {
    expect(formatOptionalStringArray(null)).toBe('');
  });

  test('returns empty string for empty array', () => {
    expect(formatOptionalStringArray([])).toBe('');
  });

  test('joins values with newlines', () => {
    expect(formatOptionalStringArray(['https://a', 'https://b'])).toBe(
      'https://a\nhttps://b'
    );
  });

  test('joins values with a custom delimiter', () => {
    expect(formatOptionalStringArray(['a', 'b', 'c'], ', ')).toBe('a, b, c');
  });
});
