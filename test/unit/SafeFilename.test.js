import { jest } from '@jest/globals';

// The names of the files an export writes for objects whose ids are free text.
// The library's own slug is replaced by a small stand-in here (the bundled
// library cannot load under jest's ESM runtime); the helper only adds the rules
// for an empty, an over-long and a repeated slug on top of it.

const slugify = (name) =>
  name
    .replace(/^http(s?):\/\//, '')
    .replace(/[^\w\s$*_+~.()'"!\-@]+/g, '')
    .trim()
    .replace(/\s+/g, '-');

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      getTypedFilename: (name, type, suffix = 'json') =>
        `${slugify(name)}.${type}.${suffix}`,
    },
  },
}));

const { safeTypedFilename } =
  await import('../../src/ops/utils/SafeFilename.ts');

const TYPE = 'oauth2.issuer';
const SHA_OF = {
  // the first 8 hex digits of the SHA-256 of the id
  '///': '732c4e97',
};

describe('safeTypedFilename', () => {
  test('is the name of the library for an id that makes a normal slug', () => {
    expect(safeTypedFilename('zion-trusted-issuer', TYPE)).toBe(
      'zion-trusted-issuer.oauth2.issuer.json'
    );
  });

  test('gives an id that makes an empty slug a name of its own, deterministic and without a leading dash', () => {
    const name = safeTypedFilename('///', TYPE);

    expect(name).toMatch(/^[0-9a-f]{8}\.oauth2\.issuer\.json$/);
    expect(safeTypedFilename('///', TYPE)).toBe(name);
    expect(name).toBe(`${SHA_OF['///']}.oauth2.issuer.json`);
  });

  test('cuts a slug of more than 120 characters to 100 and adds the digest of the id', () => {
    const id = 'a'.repeat(5000);

    const name = safeTypedFilename(id, TYPE);

    expect(name).toMatch(/^a{100}-[0-9a-f]{8}\.oauth2\.issuer\.json$/);
    expect(name.length).toBeLessThan(140);
    expect(safeTypedFilename(id, TYPE)).toBe(name);
  });

  test('keeps a slug of exactly 120 characters', () => {
    const id = 'b'.repeat(120);

    expect(safeTypedFilename(id, TYPE)).toBe(`${id}.oauth2.issuer.json`);
  });

  test('two ids with one slug get different names in one run', () => {
    const taken = new Set();

    const first = safeTypedFilename('ab', TYPE, taken);
    const second = safeTypedFilename('a/b', TYPE, taken);
    const third = safeTypedFilename('ab', TYPE, taken);

    expect(first).toBe('ab.oauth2.issuer.json');
    expect(second).toMatch(/^ab-[0-9a-f]{8}\.oauth2\.issuer\.json$/);
    expect(third).toMatch(/^ab-[0-9a-f]{8}\.oauth2\.issuer\.json$/);
    expect(new Set([first, second]).size).toBe(2);
    // a name that is already in the set is never handed out again
    expect([...taken]).toEqual([first, second, third]);
  });

  test('a name that is taken only matters within the set it is given', () => {
    safeTypedFilename('zion', TYPE, new Set());

    expect(safeTypedFilename('zion', TYPE, new Set())).toBe(
      'zion.oauth2.issuer.json'
    );
    expect(safeTypedFilename('zion', TYPE)).toBe('zion.oauth2.issuer.json');
  });
});
