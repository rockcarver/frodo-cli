import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

/**
 * Private and secret key material in agent files (record 0055, core record 0013): a
 * pull replaces a key set that holds a private or symmetric key by the placeholder of a
 * variable, and a push fills the variable from the key set as it is. The module has no
 * import of the library, so nothing is mocked here; the library's placeholder
 * resolution is copied into a fake reader and shown against the real one in
 * ConfigManagerOauthIssuersFakeTenant.test.js.
 */
const {
  holdsSecretKeyMaterial,
  keySetVariable,
  readAgentFile,
  redactKeySets,
  redactedKeySetMessage,
} = await import('../../src/ops/AgentKeySets.ts');

const jwks = (...keys) => JSON.stringify({ keys });
const publicRsa = {
  kty: 'RSA',
  kid: 'k1',
  use: 'sig',
  n: 'modulus',
  e: 'AQAB',
};

describe('holdsSecretKeyMaterial', () => {
  it.each([
    ['an RSA private key (d)', { kty: 'RSA', n: 'x', e: 'AQAB', d: 'priv' }],
    [
      'an RSA private key (p, q, dp, dq, qi)',
      { kty: 'RSA', p: 'a', q: 'b', dp: 'c', dq: 'd', qi: 'e' },
    ],
    ['an RSA multi-prime key (oth)', { kty: 'RSA', oth: [{ r: 'a' }] }],
    [
      'an EC private key (d)',
      { kty: 'EC', crv: 'P-256', x: 'a', y: 'b', d: 'priv' },
    ],
    [
      'an OKP private key (d)',
      { kty: 'OKP', crv: 'Ed25519', x: 'a', d: 'priv' },
    ],
    ['a symmetric key (k)', { kty: 'oct', k: 'secret' }],
  ])('is true for %s', (_what, key) => {
    expect(holdsSecretKeyMaterial(jwks(key))).toBe(true);
  });

  it.each([
    ['an RSA public key', publicRsa],
    ['an EC public key', { kty: 'EC', crv: 'P-256', x: 'a', y: 'b' }],
    ['an OKP public key', { kty: 'OKP', crv: 'Ed25519', x: 'a' }],
    ['a certificate chain', { kty: 'RSA', n: 'x', e: 'AQAB', x5c: ['MIIB'] }],
  ])('is false for %s', (_what, key) => {
    expect(holdsSecretKeyMaterial(jwks(key))).toBe(false);
  });

  it('is true when one key of several is private', () => {
    expect(
      holdsSecretKeyMaterial(jwks(publicRsa, { kty: 'oct', k: 'x' }))
    ).toBe(true);
  });

  it('reads a wrapped value, an object, a single JWK and a string', () => {
    const secret = { kty: 'oct', k: 'x' };
    expect(
      holdsSecretKeyMaterial({ inherited: false, value: jwks(secret) })
    ).toBe(true);
    expect(holdsSecretKeyMaterial({ keys: [secret] })).toBe(true);
    expect(holdsSecretKeyMaterial(JSON.stringify(secret))).toBe(true);
  });

  it('is false for what is not a key set', () => {
    for (const value of [
      undefined,
      null,
      '',
      'not json',
      '"text"',
      '5',
      {},
      { inherited: false },
      '${ZION_ISSUER_JWKSET}',
    ]) {
      expect(holdsSecretKeyMaterial(value)).toBe(false);
    }
  });
});

describe('keySetVariable', () => {
  it('is the id in upper case, a dash as an underscore, and _JWKSET', () => {
    expect(keySetVariable('zion-issuer')).toBe('ZION_ISSUER_JWKSET');
    expect(keySetVariable('Neo')).toBe('NEO_JWKSET');
  });

  it('turns every character that a variable name cannot have into an underscore', () => {
    expect(keySetVariable('zion.issuer:1/a b')).toBe(
      'ZION_ISSUER_1_A_B_JWKSET'
    );
  });
});

describe('redactKeySets', () => {
  const secretSet = jwks({ kty: 'RSA', n: 'x', e: 'AQAB', d: 'private-part' });

  it('replaces a key set with private key material by the placeholder of its variable', () => {
    const config = {
      _id: 'zion-issuer',
      issuer: 'https://zion.example.com',
      jwkSet: secretSet,
    };

    const redacted = redactKeySets(config, 'zion-issuer');

    expect(redacted).toEqual([
      { field: 'jwkSet', variable: 'ZION_ISSUER_JWKSET' },
    ]);
    expect(config).toEqual({
      _id: 'zion-issuer',
      issuer: 'https://zion.example.com',
      jwkSet: '${ZION_ISSUER_JWKSET}',
    });
  });

  it('replaces the whole value when one key among public ones is private', () => {
    const config = {
      jwkSet: jwks(publicRsa, { kty: 'oct', k: 'secret-part' }),
    };

    redactKeySets(config, 'zion-issuer');

    expect(config.jwkSet).toBe('${ZION_ISSUER_JWKSET}');
    expect(JSON.stringify(config)).not.toContain('modulus');
  });

  it('finds the key set of an OAuth2 client in its signing and encryption group', () => {
    const config = {
      signEncOAuth2ClientConfig: { jwkSet: secretSet, other: 1 },
    };

    const redacted = redactKeySets(config, 'zion-client');

    expect(redacted).toEqual([
      {
        field: 'signEncOAuth2ClientConfig.jwkSet',
        variable: 'ZION_CLIENT_JWKSET',
      },
    ]);
    expect(config.signEncOAuth2ClientConfig).toEqual({
      jwkSet: '${ZION_CLIENT_JWKSET}',
      other: 1,
    });
  });

  it('gives a second key set of one object a variable of its own', () => {
    const config = {
      jwkSet: secretSet,
      signEncOAuth2ClientConfig: { jwkSet: secretSet },
    };

    const redacted = redactKeySets(config, 'zion');

    expect(redacted.map(({ variable }) => variable)).toEqual([
      'ZION_JWKSET',
      'ZION_JWKSET_2',
    ]);
  });

  it('uses the variable that a kind with its own naming asks for, and numbers a second key set from it', () => {
    const config = {
      jwkSet: secretSet,
      signEncOAuth2ClientConfig: { jwkSet: secretSet },
    };

    const redacted = redactKeySets(config, 'zion', 'APP_ZION_PORTAL_JWKSET');

    expect(redacted.map(({ variable }) => variable)).toEqual([
      'APP_ZION_PORTAL_JWKSET',
      'APP_ZION_PORTAL_JWKSET_2',
    ]);
    expect(config.jwkSet).toBe('${APP_ZION_PORTAL_JWKSET}');
    expect(config.signEncOAuth2ClientConfig.jwkSet).toBe(
      '${APP_ZION_PORTAL_JWKSET_2}'
    );
  });

  it('names the variable after the id when no variable is asked for', () => {
    const config = { jwkSet: secretSet };

    expect(redactKeySets(config, 'zion-issuer')).toEqual([
      { field: 'jwkSet', variable: 'ZION_ISSUER_JWKSET' },
    ]);
  });

  it('leaves a key set with public keys, an unset one and a placeholder alone', () => {
    for (const jwkSet of [
      jwks(publicRsa),
      undefined,
      null,
      '${MY_OWN_VARIABLE}',
    ]) {
      const config = { jwkSet };
      expect(redactKeySets(config, 'zion-issuer')).toEqual([]);
      expect(config.jwkSet).toBe(jwkSet);
    }
    expect(redactKeySets({}, 'zion-issuer')).toEqual([]);
    expect(redactKeySets({ signEncOAuth2ClientConfig: null }, 'zion')).toEqual(
      []
    );
  });
});

describe('redactedKeySetMessage', () => {
  it('names the object, the realm, the property and the variable, and no part of the key', () => {
    const message = redactedKeySetMessage(
      'trusted JWT issuer',
      'zion-issuer',
      'alpha',
      {
        field: 'jwkSet',
        variable: 'ZION_ISSUER_JWKSET',
      }
    );

    expect(message).toBe(
      "Trusted JWT issuer 'zion-issuer' of realm 'alpha' holds private or secret key material in jwkSet: it is not written. The file has ${ZION_ISSUER_JWKSET} in its place; set that variable to the key set when you push."
    );
  });
});

describe('readAgentFile', () => {
  let dir;
  let environment;
  let processSwitch;
  let reads;

  const FILE =
    '{ "_id": "zion-issuer", "jwkSet": "${ZION_ISSUER_JWKSET}", "other": "${OTHER}" }';

  /** The library's `readJsonFile`, copied: the placeholders are put into the TEXT before it is parsed. */
  const read = (file) => {
    reads.push({ ...environment });
    let content = fs.readFileSync(file, 'utf8');
    for (const placeholder of content.match(/\\*?\${.*?}/g) ?? []) {
      const name = placeholder.replace(/\${(.*)}/, '$1');
      const value =
        environment[name] ?? (processSwitch ? process.env[name] : undefined);
      if (value === undefined)
        throw new Error(`No value found for placeholder "${name}"`);
      content = content.replaceAll(placeholder, value);
    }
    return JSON.parse(content);
  };

  /** The part of the library's state that the function uses. */
  const state = {
    getEnv: (key) => environment[key],
    getEnvs: () => environment,
    setEnv: (key, value) => {
      environment[key] = value;
    },
    setEnvs: (env, clear) => {
      environment = clear ? { ...env } : { ...environment, ...env };
    },
    getUseProcessEnvironmentForPlaceholders: () => processSwitch,
  };

  const write = (content = FILE) => {
    const file = path.join(dir, 'zion-issuer.json');
    fs.writeFileSync(file, content);
    return file;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-key-sets-'));
    environment = {};
    processSwitch = false;
    reads = [];
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.ZION_ISSUER_JWKSET;
  });

  it('puts a key set from a variable into the file as the string it is', () => {
    const keySet = jwks({
      kty: 'RSA',
      n: 'x',
      e: 'AQAB',
      d: 'private-"part"\\n',
    });
    environment = { ZION_ISSUER_JWKSET: keySet, OTHER: 'plain' };

    const object = readAgentFile(write(), read, state);

    expect(object).toEqual({
      _id: 'zion-issuer',
      jwkSet: keySet,
      other: 'plain',
    });
  });

  it('shows what the library does without it: a key set in the variable breaks the file', () => {
    environment = { ZION_ISSUER_JWKSET: jwks(publicRsa), OTHER: 'plain' };

    expect(() => read(write())).toThrow(/JSON/);
  });

  it('fills a value that is not a JSON object as it is: one that somebody already escaped by hand still works', () => {
    environment = { ZION_ISSUER_JWKSET: '{\\"keys\\":[]}', OTHER: 'plain' };

    expect(readAgentFile(write(), read, state)).toEqual({
      _id: 'zion-issuer',
      jwkSet: '{"keys":[]}',
      other: 'plain',
    });
  });

  it('takes the value from the environment of the process only when the state says so', () => {
    process.env.ZION_ISSUER_JWKSET = jwks(publicRsa);
    environment = { OTHER: 'plain' };

    expect(() => readAgentFile(write(), read, state)).toThrow(
      'No value found for placeholder "ZION_ISSUER_JWKSET"'
    );

    processSwitch = true;
    expect(readAgentFile(write(), read, state).jwkSet).toBe(jwks(publicRsa));
  });

  it('fails and names the variable when nothing has a value, and fills nothing', () => {
    environment = { OTHER: 'plain' };

    expect(() => readAgentFile(write(), read, state)).toThrow(
      'No value found for placeholder "ZION_ISSUER_JWKSET"'
    );
  });

  it('puts the values of the state back, also after a failure', () => {
    environment = { ZION_ISSUER_JWKSET: jwks(publicRsa), UNRELATED: 'kept' };
    const before = { ...environment };
    const file = write(
      '{ "jwkSet": "${ZION_ISSUER_JWKSET}", "other": "${MISSING}" }'
    );

    expect(() => readAgentFile(file, read, state)).toThrow('MISSING');

    expect(environment).toEqual(before);
    // the escaped value was in the state while the file was read
    expect(reads[0].ZION_ISSUER_JWKSET).not.toBe(before.ZION_ISSUER_JWKSET);
  });

  it('removes a value it took from the process environment, after the read', () => {
    processSwitch = true;
    process.env.ZION_ISSUER_JWKSET = jwks(publicRsa);
    environment = { OTHER: 'plain' };

    readAgentFile(write(), read, state);

    expect(environment).toEqual({ OTHER: 'plain' });
  });

  it('does not touch the state for a file without a placeholder that stands for the whole key set', () => {
    const touched = [];
    const watching = {
      ...state,
      setEnv: () => touched.push('setEnv'),
      setEnvs: () => touched.push('setEnvs'),
    };
    environment = { OTHER: 'x' };

    // a placeholder inside a longer text, an unset key set, and no key set at all
    readAgentFile(write('{ "jwkSet": "keys-${OTHER}" }'), read, watching);
    readAgentFile(
      write('{ "jwkSet": null, "other": "${OTHER}" }'),
      read,
      watching
    );
    readAgentFile(write('{ "other": "${OTHER}" }'), read, watching);

    expect(touched).toEqual([]);
  });

  it('leaves the error of a file that cannot be read to the reader', () => {
    expect(() =>
      readAgentFile(path.join(dir, 'missing.json'), read, state)
    ).toThrow(/ENOENT/);
  });
});
