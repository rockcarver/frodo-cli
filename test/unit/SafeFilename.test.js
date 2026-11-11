import { jest } from '@jest/globals';
import { getTypedFilename } from '../utils/LibFilenames.js';

/**
 * safeTypedFilename (src/ops/utils/SafeFilename.ts): a file name for an object
 * id that file systems accept. `getTypedFilename` of the library slugifies and
 * caps nothing, and some ids are free text of thousands of characters, or have
 * an empty slug, or share one slug with another id.
 */
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: { utils: { getTypedFilename } },
}));

const { safeTypedFilename } =
  await import('../../src/ops/utils/SafeFilename.ts');

const TYPE = 'cimd.agent';

describe('safeTypedFilename', () => {
  test('an id that makes a usable name keeps the name the library makes', () => {
    expect(safeTypedFilename('zion-mcp-clients', TYPE)).toBe(
      'zion-mcp-clients.cimd.agent.json'
    );
    expect(safeTypedFilename('a@b.c', TYPE)).toBe('a@b.c.cimd.agent.json');
    expect(safeTypedFilename('Ünï', TYPE)).toBe('Uni.cimd.agent.json');
  });

  test('a name part of 120 characters is kept, one of 121 is cut to 100 and gets the hash of the id', () => {
    expect(safeTypedFilename('x'.repeat(120), TYPE)).toBe(
      `${'x'.repeat(120)}.cimd.agent.json`
    );
    expect(safeTypedFilename('x'.repeat(121), TYPE)).toMatch(
      /^x{100}-[0-9a-f]{8}\.cimd\.agent\.json$/
    );
  });

  test('an id of thousands of characters makes a name well below what file systems accept', () => {
    expect(
      safeTypedFilename('x'.repeat(7500), TYPE).length
    ).toBeLessThanOrEqual(140);
  });

  test('an id with an empty slug (CJK letters, an emoji) is named by the hash alone, and two of them differ', () => {
    const first = safeTypedFilename('日本語', TYPE);
    const second = safeTypedFilename('😀', TYPE);

    expect(first).toMatch(/^[0-9a-f]{8}\.cimd\.agent\.json$/);
    expect(second).toMatch(/^[0-9a-f]{8}\.cimd\.agent\.json$/);
    expect(first).not.toBe(second);
  });

  test('the hash is the first 8 hex digits of the SHA-256 of the id, so a second export writes the same name', () => {
    expect(safeTypedFilename('日本語', TYPE)).toBe(
      safeTypedFilename('日本語', TYPE)
    );
    // the first 8 hex digits of sha256('日本語'), computed independently and pinned
    expect(safeTypedFilename('日本語', TYPE)).toBe('77710aed.cimd.agent.json');
  });

  test('two ids with one slug: the second gets the hash when they share a run, neither when they do not', () => {
    expect(safeTypedFilename('a b', TYPE)).toBe('a-b.cimd.agent.json');
    expect(safeTypedFilename('a-b', TYPE)).toBe('a-b.cimd.agent.json');

    const taken = new Set();
    expect(safeTypedFilename('a b', TYPE, taken)).toBe('a-b.cimd.agent.json');
    expect(safeTypedFilename('a-b', TYPE, taken)).toMatch(
      /^a-b-[0-9a-f]{8}\.cimd\.agent\.json$/
    );
    expect(taken.size).toBe(2);
  });

  test('names are compared ignoring case, because the file system may', () => {
    const taken = new Set();

    expect(safeTypedFilename('abc', TYPE, taken)).toBe('abc.cimd.agent.json');
    // the library keeps case, so these two slugs differ only in case
    expect(safeTypedFilename('ABC', TYPE, taken)).toMatch(
      /^ABC-[0-9a-f]{8}\.cimd\.agent\.json$/
    );
  });
});
