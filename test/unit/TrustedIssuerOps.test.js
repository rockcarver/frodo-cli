/**
 * Unit tests for the `oauth issuer` verbs (src/ops/OAuth2TrustedJwtIssuerOps.ts),
 * without a tenant. The real import graph pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the facade and the
 * console are mocked before the module under test is imported. What these tests
 * guard is what the commands add to the library: the two shapes of a read (a read
 * by id wraps every setting in `{ inherited, value }`, a query answers plain
 * values), `any user` for an issuer without allowed subjects, an id that is
 * never an empty string or a quiet success, and an output that does not depend
 * on the deployment type.
 */
import { jest } from '@jest/globals';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);

/** An issuer in the plain shape of a query (`null` for a setting that is not set). */
const plainIssuer = (id, more = {}) => ({
  _id: id,
  _rev: '1',
  issuer: `https://${id}.example.com`,
  allowedSubjects: ['neo', 'trinity'],
  jwksUri: `https://${id}.example.com/jwks`,
  jwkSet: null,
  jwksCacheTimeout: 3600000,
  jwkStoreCacheMissCacheTime: 60000,
  consentedScopesClaim: 'scope',
  resourceOwnerIdentityClaim: 'sub',
  agentgroup: null,
  _type: {
    _id: 'TrustedJwtIssuer',
    name: 'OAuth2 Trusted JWT Issuer',
    collection: true,
  },
  ...more,
});

/** The same issuer as a read by id answers it (`value` missing for a setting that is not set). */
const wrappedIssuer = (id, more = {}) => {
  const plain = plainIssuer(id, more);
  return Object.fromEntries(
    Object.entries(plain).map(([key, value]) => [
      key,
      key.startsWith('_') || key === 'agentgroup'
        ? value
        : value === null
          ? { inherited: false }
          : { inherited: false, value },
    ])
  );
};

let stored = [];
let wrapped = true;
let readFailure;
let deploymentType = 'cloud';
const calls = [];

const lib = {
  readOAuth2TrustedJwtIssuers: async () => {
    if (readFailure) throw readFailure;
    return structuredClone(stored);
  },
  readOAuth2TrustedJwtIssuer: async (id) => {
    calls.push(['readOAuth2TrustedJwtIssuer', id]);
    const found = stored.find((entry) => entry._id === id);
    if (!found) throw new Error(`no such trusted issuer ${id}`);
    return structuredClone(wrapped ? wrappedIssuer(id, found) : found);
  },
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  state: { getDeploymentType: () => deploymentType },
  frodo: {
    utils: {},
    oauth2oidc: { issuer: lib },
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
  printError: (error, message) =>
    printed.push({
      msg: [message, error?.message ?? String(error)]
        .filter(Boolean)
        .join(': '),
      type: 'error',
    }),
  createTable: (head) => {
    const rows = [head];
    return {
      push: (row) => rows.push(row),
      toString: () => rows.map((row) => row.join(' | ')).join('\n'),
    };
  },
}));

// the theme reads the terminal helpers of the library; the colours do not matter here
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: {
    heading: (text) => text,
    positive: (text) => text,
    negative: (text) => text,
  },
}));

const { listOAuth2TrustedJwtIssuers, describeOAuth2TrustedJwtIssuer } =
  await import('../../src/ops/OAuth2TrustedJwtIssuerOps.ts');

beforeEach(() => {
  printed.length = 0;
  calls.length = 0;
  stored = [];
  wrapped = true;
  readFailure = undefined;
  deploymentType = 'cloud';
});

describe('listOAuth2TrustedJwtIssuers', () => {
  beforeEach(() => {
    stored = [plainIssuer('zion'), plainIssuer('alpha-issuer')];
  });

  test('lists the id of every issuer, sorted by id', async () => {
    await expect(listOAuth2TrustedJwtIssuers()).resolves.toBe(true);

    expect(messages('data')).toEqual(['alpha-issuer', 'zion']);
  });

  test('--long shows the issuer, the allowed subjects one per line and the JWKS URI', async () => {
    await expect(listOAuth2TrustedJwtIssuers(true)).resolves.toBe(true);

    const [table] = messages('data');
    expect(table).toBe(
      [
        'Id | Issuer | Allowed subjects | JWKS URI',
        'alpha-issuer | https://alpha-issuer.example.com | neo\ntrinity | https://alpha-issuer.example.com/jwks',
        'zion | https://zion.example.com | neo\ntrinity | https://zion.example.com/jwks',
      ].join('\n')
    );
  });

  test('an issuer without allowed subjects reads "any user", because AM then lets it name any realm user', async () => {
    stored = [
      plainIssuer('open', { allowedSubjects: [] }),
      plainIssuer('missing', { allowedSubjects: null }),
    ];

    await listOAuth2TrustedJwtIssuers(true);

    const [table] = messages('data');
    expect(table).toContain('missing | https://missing.example.com | any user');
    expect(table).toContain('open | https://open.example.com | any user');
  });

  test('takes the wrapped shape as well as the plain one, and members that are missing do not throw', async () => {
    stored = [
      wrappedIssuer('wrapped'),
      wrappedIssuer('unset', { jwksUri: null, allowedSubjects: null }),
      { _id: 'bare' },
    ];

    await expect(listOAuth2TrustedJwtIssuers(true)).resolves.toBe(true);

    const [table] = messages('data');
    expect(table).toContain(
      'wrapped | https://wrapped.example.com | neo\ntrinity | https://wrapped.example.com/jwks'
    );
    expect(table).toContain('unset | https://unset.example.com | any user | ');
    expect(table).toContain('bare |  | any user | ');
  });

  test('a realm without issuers, which is what the library answers for the Cloud root realm, lists nothing and succeeds', async () => {
    stored = [];

    await expect(listOAuth2TrustedJwtIssuers()).resolves.toBe(true);
    await expect(listOAuth2TrustedJwtIssuers(true)).resolves.toBe(true);

    // the short form prints nothing, the long form an empty table with its header
    expect(messages('data')).toEqual([
      'Id | Issuer | Allowed subjects | JWKS URI',
    ]);
    expect(messages('error')).toEqual([]);
  });

  test('a failing read prints the error and fails', async () => {
    readFailure = new Error('Error reading alpha realm trusted issuers');

    await expect(listOAuth2TrustedJwtIssuers()).resolves.toBe(false);

    expect(messages('error')[0]).toContain(
      'Error listing trusted JWT issuers: Error reading alpha realm trusted issuers'
    );
  });
});

describe('describeOAuth2TrustedJwtIssuer', () => {
  beforeEach(() => {
    stored = [plainIssuer('zion')];
  });

  test('the table names the issuer and its settings, with the key set as present or absent', async () => {
    await expect(describeOAuth2TrustedJwtIssuer('zion')).resolves.toBe(true);

    expect(messages('data')[0]).toBe(
      [
        'Property | Value',
        'Issuer Id | zion',
        'Issuer | https://zion.example.com',
        'Allowed subjects | neo\ntrinity',
        'JWKS URI | https://zion.example.com/jwks',
        'JWK set | not set',
        'JWKS cache timeout | 3600000',
        'JWK store cache miss time | 60000',
        'Consented scopes claim | scope',
        'Resource owner identity claim | sub',
      ].join('\n')
    );
  });

  test('a key set is shown as set, never in full', async () => {
    stored = [plainIssuer('keys', { jwkSet: '{"keys":[{"kty":"RSA"}]}' })];

    await describeOAuth2TrustedJwtIssuer('keys');

    expect(messages('data')[0]).toContain('JWK set | set');
    expect(messages('data')[0]).not.toContain('RSA');
  });

  test('reads the wrapped shape of a read by id, a wrapper without a value counting as not set', async () => {
    stored = [plainIssuer('zion', { jwksUri: null, allowedSubjects: [] })];

    await expect(describeOAuth2TrustedJwtIssuer('zion')).resolves.toBe(true);

    const table = messages('data')[0];
    expect(table).toContain('JWKS URI | \n');
    expect(table).toContain('Allowed subjects | any user');
  });

  test('reads the plain shape too', async () => {
    wrapped = false;

    await expect(describeOAuth2TrustedJwtIssuer('zion')).resolves.toBe(true);

    expect(messages('data')[0]).toContain('Issuer | https://zion.example.com');
  });

  test('--json prints the object unchanged', async () => {
    await expect(describeOAuth2TrustedJwtIssuer('zion', true)).resolves.toBe(
      true
    );

    expect(JSON.parse(messages('data')[0])).toEqual(wrappedIssuer('zion'));
  });

  test('an issuer that does not exist fails and names it', async () => {
    await expect(describeOAuth2TrustedJwtIssuer('missing')).resolves.toBe(
      false
    );

    expect(messages('error')[0]).toContain('missing');
  });

  test('no id (the picker had nothing to offer) says so, reads nothing and fails; it is never an empty success', async () => {
    await expect(describeOAuth2TrustedJwtIssuer(undefined)).resolves.toBe(
      false
    );

    expect(messages('warn')).toEqual([
      'There is no trusted JWT issuer to choose from.',
    ]);
    expect(calls).toEqual([]);
    expect(messages('data')).toEqual([]);
  });
});

describe.each(['cloud', 'forgeops', 'classic'])(
  'on a %s deployment',
  (type) => {
    beforeEach(() => {
      stored = [
        plainIssuer('zion'),
        plainIssuer('open', { allowedSubjects: [] }),
      ];
    });

    /** Everything the three verbs print for the stored issuers. */
    async function output() {
      printed.length = 0;
      await listOAuth2TrustedJwtIssuers();
      await listOAuth2TrustedJwtIssuers(true);
      await describeOAuth2TrustedJwtIssuer('zion');
      await describeOAuth2TrustedJwtIssuer('open', true);
      return printed.map((entry) => `${entry.type}: ${entry.msg}`);
    }

    test('list and describe print what they print on every other deployment type, because trusted issuers exist on all of them', async () => {
      deploymentType = 'cloud';
      const reference = await output();
      deploymentType = type;

      const actual = await output();

      expect(actual).not.toEqual([]);
      expect(actual).toEqual(reference);
    });
  }
);
