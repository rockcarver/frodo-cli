import {
  isInheritedSetting,
  unwrapInheritedSettings,
} from '../../src/ops/utils/InheritedSettings.ts';
import { valueOf } from '../../src/ops/utils/InheritedValue.ts';

// The two shapes of a read of an AM configuration object: a read by id wraps a
// setting in `{ inherited, value }` (no `value` when it is not set), a query
// answers the plain value (`null` when it is not set). `valueOf` decides what to
// show; `unwrapInheritedSettings` rewrites an object into the plain shape.

describe('valueOf (src/ops/utils/InheritedValue.ts)', () => {
  test('is the value of a wrapped setting', () => {
    expect(valueOf({ inherited: false, value: 'a' })).toBe('a');
    expect(valueOf({ inherited: false, value: ['a', 'b'] })).toEqual([
      'a',
      'b',
    ]);
    expect(valueOf({ inherited: false, value: 0 })).toBe(0);
    expect(valueOf({ inherited: false, value: [] })).toEqual([]);
  });

  test('is the setting itself when it is plain', () => {
    expect(valueOf('a')).toBe('a');
    expect(valueOf(['a'])).toEqual(['a']);
    expect(valueOf(3600000)).toBe(3600000);
    expect(valueOf(false)).toBe(false);
  });

  test('has no value for a wrapper without one, for a value that is inherited, for null and for an absent setting', () => {
    expect(valueOf({ inherited: false })).toBeUndefined();
    expect(valueOf({ inherited: false, value: null })).toBeUndefined();
    expect(valueOf({ inherited: true, value: 'a' })).toBeUndefined();
    expect(valueOf(null)).toBeUndefined();
    expect(valueOf(undefined)).toBeUndefined();
  });
});

describe('isInheritedSetting', () => {
  test.each([
    [{ inherited: false }, true],
    [{ inherited: true, value: 'a' }, true],
    [{ value: 'a' }, false],
    [{ inherited: false, value: 'a', extra: 1 }, false],
    [['inherited'], false],
    ['inherited', false],
    [null, false],
    [undefined, false],
  ])('%j is %s', (property, expected) => {
    expect(isInheritedSetting(property)).toBe(expected);
  });
});

describe('unwrapInheritedSettings', () => {
  test('turns a read by id into the plain shape of a query, null for a setting that is not set', () => {
    const wrapped = {
      _id: 'zion',
      _rev: '1',
      issuer: { inherited: false, value: 'https://zion.example.com' },
      allowedSubjects: { inherited: false, value: [] },
      jwksUri: { inherited: false },
      jwksCacheTimeout: { inherited: false, value: 3600000 },
      _type: { _id: 'TrustedJwtIssuer', name: 'x', collection: true },
    };

    expect(unwrapInheritedSettings(wrapped)).toEqual({
      _id: 'zion',
      _rev: '1',
      issuer: 'https://zion.example.com',
      allowedSubjects: [],
      jwksUri: null,
      jwksCacheTimeout: 3600000,
      _type: { _id: 'TrustedJwtIssuer', name: 'x', collection: true },
    });
  });

  test('a setting that only looks like a wrapper is kept', () => {
    const object = { odd: { inherited: false, value: 'a', other: 1 } };

    expect(unwrapInheritedSettings(object)).toEqual(object);
  });

  test('leaves a plain object as it is, and does not change what it is given', () => {
    const plain = { _id: 'zion', jwkSet: null, allowedSubjects: ['neo'] };
    const wrapped = { a: { inherited: false, value: 1 } };
    const copy = structuredClone(wrapped);

    expect(unwrapInheritedSettings(plain)).toEqual(plain);
    unwrapInheritedSettings(wrapped);

    expect(wrapped).toEqual(copy);
  });
});
