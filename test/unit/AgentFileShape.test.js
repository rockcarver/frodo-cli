import { describe, expect, it } from '@jest/globals';

/**
 * The one function that every writer of agent files uses (record 0054, rule 6,
 * frodo-cli#1355): a property that is set on the object becomes its plain value;
 * an unset, an inherited and a null property are left out; the input is never
 * changed. The by-id read of AM is the writable shape and the list read is plain
 * with null for what is not set; both must give the same file (the shapes below
 * are the ones of the library's recordings of a CIMD profile, with sample names).
 */
const { toPlainShape, plainOverrides, leftOutMessage } =
  await import('../../src/ops/AgentFileShape.ts');

const set = (value) => ({ inherited: false, value });
const unset = () => ({ inherited: false });
const inherited = (value) => ({ inherited: true, value });

describe('toPlainShape: a pulled object', () => {
  it('writes a property that is set on the object as its value', () => {
    const { value, leftOut } = toPlainShape({
      _id: 'zion-agents',
      cimdConfig: {
        cimdClientIdUrlPatterns: set(['https://zion.example.com/*']),
        ssrfProtection: set(true),
      },
    });
    expect(value).toEqual({
      _id: 'zion-agents',
      cimdConfig: {
        cimdClientIdUrlPatterns: ['https://zion.example.com/*'],
        ssrfProtection: true,
      },
    });
    expect(leftOut).toBe(0);
  });

  it('leaves out an unset property and counts it', () => {
    const { value, leftOut } = toPlainShape({
      group: { kept: set('a'), gone: unset(), alsoGone: unset() },
    });
    expect(value).toEqual({ group: { kept: 'a' } });
    expect(leftOut).toBe(2);
  });

  it('leaves out an inherited property and counts it', () => {
    const { value, leftOut } = toPlainShape({
      group: { local: set('x'), fromGroup: inherited('default') },
    });
    expect(value).toEqual({ group: { local: 'x' } });
    expect(leftOut).toBe(1);
  });

  it('treats a wrapper with a null value as unset', () => {
    const { value, leftOut } = toPlainShape({
      group: { a: { inherited: false, value: null }, b: set(0) },
    });
    expect(value).toEqual({ group: { b: 0 } });
    expect(leftOut).toBe(1);
  });

  it('keeps false, 0, the empty string and the empty array: they are set values', () => {
    const { value, leftOut } = toPlainShape({
      group: { f: set(false), z: set(0), s: set(''), a: set([]) },
    });
    expect(value).toEqual({ group: { f: false, z: 0, s: '', a: [] } });
    expect(leftOut).toBe(0);
  });

  it('keeps a group as an empty object when all its members were left out', () => {
    const { value, leftOut } = toPlainShape({
      emptied: { a: unset(), b: inherited(1) },
      other: { c: set(1) },
    });
    expect(value).toEqual({ emptied: {}, other: { c: 1 } });
    expect(leftOut).toBe(2);
  });

  it('walks arrays and unwraps what is in them', () => {
    const { value, leftOut } = toPlainShape({
      list: set([{ id: set('a') }, { id: set('b'), note: unset() }]),
    });
    expect(value).toEqual({ list: [{ id: 'a' }, { id: 'b' }] });
    expect(leftOut).toBe(1);
  });

  it('unwraps a wrapper inside the value that it keeps', () => {
    const { value } = toPlainShape({
      outer: set({ inner: set('x'), gone: unset() }),
    });
    expect(value).toEqual({ outer: { inner: 'x' } });
  });

  it('does not take an object that has a member called inherited for a wrapper', () => {
    const object = {
      settings: { inherited: true, name: 'kept', value: 3 },
      notBoolean: { inherited: 'yes', value: 1 },
      onlyValue: { value: 5 },
    };
    const { value, leftOut } = toPlainShape(object);
    expect(value).toEqual(object);
    expect(leftOut).toBe(0);
  });

  it('is strict about a bare value: { value } is not a wrapper in a pulled object', () => {
    const { value } = toPlainShape({ map: { value: 'x' } });
    expect(value).toEqual({ map: { value: 'x' } });
  });

  it('leaves out a null property, as the list read answers it for what is not set', () => {
    const { value, leftOut } = toPlainShape({
      _id: 'x',
      sectorIdentifierUri: null,
      group: { jwksUri: null, kept: 'y' },
    });
    expect(value).toEqual({ _id: 'x', group: { kept: 'y' } });
    expect(leftOut).toBe(2);
  });

  it('keeps a null element of an array: a position means something', () => {
    const { value, leftOut } = toPlainShape({ list: [null, 'a'] });
    expect(value).toEqual({ list: [null, 'a'] });
    expect(leftOut).toBe(0);
  });

  it('does not change its input', () => {
    const input = {
      _id: 'x',
      group: { a: set([1, 2]), b: unset(), c: inherited('d') },
      list: [set('e')],
    };
    const before = JSON.stringify(input);
    const { value } = toPlainShape(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(value).not.toBe(input);
    expect(value.group).not.toBe(input.group);
  });

  it('answers an empty object for an empty object', () => {
    expect(toPlainShape({})).toEqual({ value: {}, leftOut: 0 });
  });
});

describe('toPlainShape: the single read and the list read give the same file', () => {
  // the shapes of one CIMD profile: the by-id read (writable shape, unset as { inherited: false })
  // and the list item (plain, null for what is not set)
  const byId = {
    _id: 'FrodoTest CIMD id [x]^|é$&=:@~.',
    _rev: '2',
    _type: { _id: 'CIMDProfile', name: 'CIMD Profile', collection: true },
    cimdConfig: {
      cimdClientIdUrlPatterns: set(['https://zion.example.com/*']),
      cimdMetadataDenyList: set(['redirect_uris']),
      ssrfProtection: set(true),
    },
    coreOAuth2ClientConfig: {
      status: set('Active'),
      scopes: set([]),
      defaultScopes: unset(),
    },
    signEncOAuth2ClientConfig: {
      jwkSet: unset(),
      jwksUri: { inherited: false, value: null },
      userinfoSignedResponseAlg: unset(),
    },
  };
  const listItem = {
    _id: 'FrodoTest CIMD id [x]^|é$&=:@~.',
    _rev: '2',
    _type: { _id: 'CIMDProfile', name: 'CIMD Profile', collection: true },
    cimdConfig: {
      cimdClientIdUrlPatterns: ['https://zion.example.com/*'],
      cimdMetadataDenyList: ['redirect_uris'],
      ssrfProtection: true,
    },
    coreOAuth2ClientConfig: {
      status: 'Active',
      scopes: [],
      defaultScopes: null,
    },
    signEncOAuth2ClientConfig: {
      jwkSet: null,
      jwksUri: null,
      userinfoSignedResponseAlg: null,
    },
  };

  it('writes the same bytes for both answers', () => {
    const a = toPlainShape(byId).value;
    const b = toPlainShape(listItem).value;
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('counts what it left out differently only because the two answers say "not set" differently', () => {
    expect(toPlainShape(byId).leftOut).toBe(4);
    expect(toPlainShape(listItem).leftOut).toBe(4);
  });
});

describe('plainOverrides: an overrides file written for the wrapped files', () => {
  it('reads { value } as the value (the help of the first 5.0.0 prereleases)', () => {
    expect(
      plainOverrides({
        cimdConfig: {
          cimdClientIdUrlPatterns: { value: ['https://${HOST}/*'] },
        },
      })
    ).toEqual({
      cimdConfig: { cimdClientIdUrlPatterns: ['https://${HOST}/*'] },
    });
  });

  it('reads { inherited: false, value } as the value', () => {
    expect(
      plainOverrides({ jwksUri: { inherited: false, value: '${JWKS_URI}' } })
    ).toEqual({ jwksUri: '${JWKS_URI}' });
  });

  it('leaves a plain override alone', () => {
    const plain = { userpassword: '${MY_AGENT_PASSWORD}', nested: { a: 1 } };
    expect(plainOverrides(plain)).toEqual(plain);
  });

  it('does not leave out a null that a person wrote', () => {
    expect(plainOverrides({ note: null })).toEqual({ note: null });
  });

  it('drops an override that is an unset or an inherited wrapper: it sets nothing', () => {
    expect(plainOverrides({ a: { inherited: false }, b: 'x' })).toEqual({
      b: 'x',
    });
  });

  it('does not change the overrides object', () => {
    const overrides = { a: { value: 1 }, b: { c: { value: 2 } } };
    const before = JSON.stringify(overrides);
    plainOverrides(overrides);
    expect(JSON.stringify(overrides)).toBe(before);
  });
});

describe('leftOutMessage', () => {
  it('says how many properties were left out of how many objects', () => {
    expect(leftOutMessage(1, 1, 'CIMD profile', 'CIMD profiles')).toBe(
      'Left 1 unset or inherited property out of 1 CIMD profile written: a file holds only what is set on the object.'
    );
    expect(leftOutMessage(138, 28, 'agent', 'agents')).toBe(
      'Left 138 unset or inherited properties out of 28 agents written: a file holds only what is set on the object.'
    );
  });
});
