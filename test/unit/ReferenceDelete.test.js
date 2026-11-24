import fs from 'fs';
import { fileURLToPath } from 'url';
import { describe, expect, jest, test } from '@jest/globals';

/**
 * The helpers that a reference-aware delete shares
 * (src/configManagerOps/ReferenceDelete.ts): the ones that know nothing about
 * journeys or any other type. They were written for `config-manager delete
 * journeys --force` and moved here so that the delete of another type can use
 * them; the journeys suites reach them only through the journeys flow, so each
 * helper is pinned here on its own.
 *
 * The module is pure: it imports no library, so it needs no stub.
 */

const {
  clearingError,
  describeFields,
  differences,
  jsonCopy,
  reasonOf,
  sameJson,
  unreadableSources,
} = await import('../../src/configManagerOps/ReferenceDelete');

describe('jsonCopy', () => {
  test('is a deep copy that does not share an object with the original', () => {
    const original = { a: { b: [1, { c: 2 }] }, d: 'x' };

    const copy = jsonCopy(original);

    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.a).not.toBe(original.a);
    expect(copy.a.b).not.toBe(original.a.b);
    copy.a.b[1].c = 3;
    expect(original.a.b[1].c).toBe(2);
  });

  test('is made of plain JSON: a key that holds undefined is dropped', () => {
    expect(jsonCopy({ a: undefined, b: 1 })).toEqual({ b: 1 });
    expect(Object.keys(jsonCopy({ a: undefined, b: 1 }))).toEqual(['b']);
  });
});

describe('sameJson', () => {
  test('ignores the order of the keys, at any depth', () => {
    expect(
      sameJson({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })
    ).toBe(true);
  });

  test('sees a different value, a missing key and a different array', () => {
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameJson({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameJson({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });

  test('reads undefined as null, so a field that is not there equals one that is null', () => {
    expect(sameJson(undefined, null)).toBe(true);
    expect(sameJson(null, undefined)).toBe(true);
    expect(sameJson(undefined, undefined)).toBe(true);
    expect(sameJson(undefined, {})).toBe(false);
    expect(sameJson(0, undefined)).toBe(false);
  });
});

describe('differences', () => {
  test('answers no path for data that is equal', () => {
    const data = { a: 1, b: { c: [1, 2] } };

    expect(differences(data, jsonCopy(data))).toEqual([]);
    expect(differences({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
  });

  test('names the dotted path of every field that changed', () => {
    const expected = { a: 1, b: { c: 'x', d: { e: true } }, f: 'same' };
    const actual = { a: 2, b: { c: 'x', d: { e: false } }, f: 'same' };

    expect(differences(expected, actual)).toEqual(['a', 'b.d.e']);
  });

  test('names a key that only one side has, from either side', () => {
    expect(differences({ a: 1 }, { a: 1, extra: 2 })).toEqual(['extra']);
    expect(differences({ a: 1, lost: 2 }, { a: 1 })).toEqual(['lost']);
    expect(differences({ a: { b: 1 } }, { a: { b: 1, c: 1 } })).toEqual([
      'a.c',
    ]);
  });

  test('names a list or a value that changed by the path of the list', () => {
    expect(differences({ list: [1, 2] }, { list: [1, 3] })).toEqual(['list']);
    expect(differences({ list: [1, 2] }, { list: [1, 2, 3] })).toEqual([
      'list',
    ]);
    expect(differences({ a: 'x' }, { a: ['x'] })).toEqual(['a']);
    expect(differences({ a: 1 }, { a: null })).toEqual(['a']);
  });

  test('does not look at the revision of the holder itself, which changes with every write', () => {
    expect(differences({ a: 1, _rev: '1' }, { a: 1, _rev: '2' })).toEqual([]);
    expect(differences({ a: 1 }, { a: 1, _rev: '2' })).toEqual([]);
  });

  test('does look at a revision of an object inside the holder', () => {
    expect(
      differences({ inner: { _rev: '1' } }, { inner: { _rev: '2' } })
    ).toEqual(['inner._rev']);
  });

  test('compares two values that are not objects, whatever the path', () => {
    expect(differences('a', 'a')).toEqual([]);
    expect(differences('a', 'b')).toEqual(['']);
  });
});

describe('describeFields', () => {
  const paths = (count) => Array.from({ length: count }, (_, n) => `f${n + 1}`);

  test('joins the paths with a comma and a space', () => {
    expect(describeFields(['a', 'b.c'])).toBe('a, b.c');
    expect(describeFields(['a'])).toBe('a');
    expect(describeFields([])).toBe('');
  });

  test('shows twelve paths and no more text when there are twelve', () => {
    expect(describeFields(paths(12))).toBe(paths(12).join(', '));
  });

  test('shows twelve paths and says how many more there are', () => {
    expect(describeFields(paths(13))).toBe(
      `${paths(12).join(', ')}, and 1 more`
    );
    expect(describeFields(paths(20))).toBe(
      `${paths(12).join(', ')}, and 8 more`
    );
  });
});

describe('clearingError', () => {
  test('is an error with the message and the flag that the holder was changed', () => {
    const error = clearingError('it was written', true);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('it was written');
    expect(error.holderChanged).toBe(true);
  });

  test('carries the flag that the holder was not changed as false, not as missing', () => {
    const error = clearingError('nothing was written', false);

    expect(error.message).toBe('nothing was written');
    expect(error.holderChanged).toBe(false);
    expect('holderChanged' in error).toBe(true);
  });
});

describe('reasonOf', () => {
  test('is the first line of the message of an error', () => {
    expect(reasonOf(new Error('read refused\nsecond line'))).toBe(
      'read refused'
    );
    expect(reasonOf(new Error('one line'))).toBe('one line');
  });

  test('is the text of anything that is not an error', () => {
    expect(reasonOf('plain text')).toBe('plain text');
    expect(reasonOf(42)).toBe('42');
    expect(reasonOf(undefined)).toBe('undefined');
    expect(reasonOf({ message: 'not an error\nsecond' })).toBe(
      '[object Object]'
    );
  });
});

describe('unreadableSources', () => {
  test('names the sources that failed, by the first line of each nested error', () => {
    const error = Object.assign(new Error('Error finding references: x'), {
      originalErrors: [
        new Error('Error reading OAuth2 clients\nsecond line'),
        new Error('Error reading policies'),
      ],
    });

    expect(unreadableSources(error)).toEqual([
      'Error reading OAuth2 clients',
      'Error reading policies',
    ]);
  });

  test('trims the blanks around the first line of a nested message', () => {
    const error = Object.assign(new Error('Error finding references: x'), {
      originalErrors: [new Error('  Error reading themes  \nsecond line')],
    });

    expect(unreadableSources(error)).toEqual(['Error reading themes']);
  });

  test('adds the cause at the bottom of a nested error, after its own message', () => {
    const error = Object.assign(new Error('Error finding references: x'), {
      originalErrors: [
        Object.assign(new Error('Error reading themes'), {
          originalErrors: [new Error('Request failed with status code 500')],
        }),
      ],
    });

    expect(unreadableSources(error)).toEqual([
      'Error reading themes: Request failed with status code 500',
    ]);
  });

  test('names a nested error once when its cause says the same', () => {
    const error = Object.assign(new Error('Error finding references: x'), {
      originalErrors: [new Error('Error reading policies')],
    });

    expect(unreadableSources(error)).toEqual(['Error reading policies']);
  });

  test('names a nested item that is not an error by its text', () => {
    const error = Object.assign(new Error('Error finding references: x'), {
      originalErrors: ['plain failure\nmore'],
    });

    expect(unreadableSources(error)).toEqual(['plain failure']);
  });

  test('is named by its own message when it nests nothing', () => {
    expect(unreadableSources(new Error('boom\nmore'))).toEqual(['boom']);
    expect(unreadableSources('plain text')).toEqual(['plain text']);
    expect(
      unreadableSources(
        Object.assign(new Error('empty'), { originalErrors: [] })
      )
    ).toEqual(['empty']);
  });
});

describe('the module', () => {
  test('imports only node:util and the error cause helper: no library, no journeys module, nothing that imports one', () => {
    const source = fs.readFileSync(
      fileURLToPath(
        new URL(
          '../../src/configManagerOps/ReferenceDelete.ts',
          import.meta.url
        )
      ),
      'utf8'
    );
    const specifiers = [
      ...source.matchAll(/^import [^;]*? from '([^']+)';$/gm),
    ].map(([, specifier]) => specifier);

    expect(specifiers).toEqual(['node:util', '../utils/ErrorCause']);
    expect(source).not.toMatch(/^import '/m);
    expect(source).not.toMatch(/^export [^;]*? from /m);
    expect(source).not.toMatch(/\brequire\(|\bimport\(/);
  });

  test('is what the journeys module still exports as unreadableSources', async () => {
    // the journeys module reads the library through `frodo` only when a function runs
    jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({ frodo: {} }));
    const journeys =
      await import('../../src/configManagerOps/JourneyReferenceClearing');

    expect(journeys.unreadableSources).toBe(unreadableSources);
  });
});
