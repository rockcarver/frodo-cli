import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

/**
 * `frodo config-manager delete trusted-jwt-issuers` (frodo-cli#1258): the issuers
 * are read first (the plan, the dry run and the answer "not found" for a name come
 * from that list), then deleted one by one by their id, every deletion one
 * operation of a run that goes on after a failure (decision record 0040). An
 * issuer is a trust anchor: the plan says that tokens and JWT grants signed by the
 * deleted issuers are rejected until an issuer for them exists again. A name that
 * is empty, a name without a single realm and a named issuer that does not exist
 * fail whatever `--allow-failures` says (record 0041). The guard that asks before a
 * bulk delete belongs to the command and is tested with it
 * (ConfigManagerDeleteTrustedJwtIssuersCommand.test.js and the guard test of the
 * real CLI).
 *
 * The library is a fake that records its calls; nothing here contacts a tenant.
 */

let deployment;
let currentRealm;
let world;
let printed;
let deleted;

class FrodoError extends Error {
  constructor(message, originalErrors) {
    super(message);
    this.name = 'FrodoError';
    this.originalErrors = Array.isArray(originalErrors)
      ? originalErrors
      : originalErrors
        ? [originalErrors]
        : [];
  }
}

const readIssuers = jest.fn();
const deleteIssuer = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError,
  state: {
    getDeploymentType: () => deployment,
    setRealm: (realm) => {
      currentRealm = realm;
    },
    getRealm: () => currentRealm,
  },
  frodo: {
    utils: {
      constants: {
        DEFAULT_REALM_KEY: '__default__realm__',
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
        CLASSIC_DEPLOYMENT_TYPE_KEY: 'classic',
      },
      getFilePath: jest.fn(),
      getWorkingDirectory: jest.fn(),
      saveJsonToFile: jest.fn(),
      readJsonFile: jest.fn(),
      escapePlaceholders: (content) => content,
      findFilesByName: jest.fn(),
      isBase64Encoded: jest.fn(),
      json: { mergeDeep: (a) => a },
    },
    realm: {
      readRealms: jest.fn(async () => world.realms.map((name) => ({ name }))),
    },
    oauth2oidc: {
      issuer: {
        readOAuth2TrustedJwtIssuers: readIssuers,
        deleteOAuth2TrustedJwtIssuer: deleteIssuer,
      },
    },
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError: jest.fn((error, message) => {
    printed.push(`ERROR ${message ? `${message}: ` : ''}${error.message}`);
  }),
  printMessage: jest.fn((message, type) => {
    printed.push(`${(type ?? 'text').toUpperCase()} ${message}`);
  }),
  verboseMessage: jest.fn(),
}));

const { configManagerDeleteTrustedJwtIssuers, showTrustedJwtIssuerDeletePlan } =
  await import('../../src/ops/OAuth2TrustedJwtIssuerConfigOps.ts');

const output = () => printed.join('\n');
const issuerObject = (id) => ({ _id: id });
const EFFECT =
  'Tokens and JWT grants signed by these issuers are rejected until a trusted JWT issuer for them exists again.';

beforeEach(() => {
  deployment = 'cloud';
  currentRealm = undefined;
  printed = [];
  deleted = [];
  world = {
    realms: ['/', 'alpha', 'bravo'],
    issuers: {},
    listFails: new Set(),
    deleteFails: new Map(),
  };
  readIssuers.mockReset().mockImplementation(async () => {
    if (world.listFails.has(currentRealm)) {
      throw new FrodoError(
        `Error reading ${currentRealm} realm trusted issuers`,
        new Error('the server answered 500')
      );
    }
    return structuredClone(world.issuers[currentRealm] ?? []);
  });
  deleteIssuer.mockReset().mockImplementation(async (id) => {
    const failure = world.deleteFails.get(`${currentRealm}/${id}`);
    if (failure) throw failure;
    deleted.push(`${currentRealm}/${id}`);
    return issuerObject(id);
  });
});
afterEach(() => {
  jest.clearAllMocks();
});

describe('deleting all trusted JWT issuers', () => {
  test('deletes every issuer of every realm that has some, saying so for each, and nothing for a realm without', async () => {
    world.issuers.alpha = [
      issuerObject('zion-b'),
      issuerObject('zion-a'),
      issuerObject('zion-c'),
    ];

    expect(await configManagerDeleteTrustedJwtIssuers()).toBe(true);

    expect(deleted).toEqual(['alpha/zion-a', 'alpha/zion-b', 'alpha/zion-c']);
    expect(output()).toContain('Deleted trusted JWT issuer: alpha/zion-a');
    expect(output()).toContain('Deleted trusted JWT issuer: alpha/zion-c');
    expect(readIssuers).toHaveBeenCalledTimes(2);
  });

  test('a dry run deletes nothing and says what would be deleted', async () => {
    world.issuers.alpha = [issuerObject('zion-a'), issuerObject('zion-b')];

    expect(
      await configManagerDeleteTrustedJwtIssuers(undefined, undefined, true)
    ).toBe(true);

    expect(deleteIssuer).not.toHaveBeenCalled();
    expect(output()).toContain(
      'Dry run: Deleting trusted JWT issuer: alpha/zion-a'
    );
    expect(output()).not.toContain('Deleted');
  });

  test('nothing to delete without a name is a success with one line', async () => {
    expect(await configManagerDeleteTrustedJwtIssuers()).toBe(true);

    expect(output()).toContain('No trusted JWT issuers found to delete.');
  });

  test('a rejection that is a raw HTTP error and not a FrodoError (the shape the library gives when the call is not awaited) is a named failure; the others still run', async () => {
    world.issuers.alpha = [
      issuerObject('zion-a'),
      issuerObject('zion-b'),
      issuerObject('zion-c'),
    ];
    world.deleteFails.set(
      'alpha/zion-b',
      Object.assign(new Error('Request failed with status code 500'), {
        isAxiosError: true,
        config: { url: 'https://openam-matrix.example.com/am/json/x/zion-b' },
      })
    );

    expect(await configManagerDeleteTrustedJwtIssuers()).toBe(false);

    expect(deleted).toEqual(['alpha/zion-a', 'alpha/zion-c']);
    expect(output()).toContain('1 of 3 trusted JWT issuers failed');
    expect(output()).toContain(
      'alpha/zion-b: Request failed with status code 500'
    );

    printed = [];
    expect(
      await configManagerDeleteTrustedJwtIssuers(
        undefined,
        undefined,
        false,
        true
      )
    ).toBe(true);
    expect(output()).toContain('The exit code stays 0');
  });

  test('a realm whose issuers cannot be listed is one failed operation named after the realm, and the other realm is deleted', async () => {
    world.issuers.alpha = [issuerObject('zion-a')];
    world.issuers.bravo = [issuerObject('zion-b')];
    world.listFails.add('bravo');

    expect(await configManagerDeleteTrustedJwtIssuers()).toBe(false);

    expect(deleted).toEqual(['alpha/zion-a']);
    expect(output()).toContain('realm bravo');
  });

  test.each(['forgeops', 'classic'])(
    'on %s the root realm is visited',
    async (shape) => {
      deployment = shape;
      world.issuers['/'] = [issuerObject('zion-root')];

      expect(await configManagerDeleteTrustedJwtIssuers()).toBe(true);

      expect(deleted).toEqual(['//zion-root']);
      expect(output()).toContain('Deleted trusted JWT issuer: root/zion-root');
    }
  );

  test('the root realm of a Cloud tenant given as the realm is a message and a success', async () => {
    expect(await configManagerDeleteTrustedJwtIssuers(undefined, '/')).toBe(
      true
    );

    expect(output()).toContain(
      'The root realm of an Identity Cloud tenant has no trusted JWT issuers.'
    );
    expect(readIssuers).not.toHaveBeenCalled();
  });
});

describe('deleting one named trusted JWT issuer', () => {
  test('deletes only that issuer, by its id', async () => {
    world.issuers.alpha = [issuerObject('zion-a'), issuerObject('zion-b')];

    expect(await configManagerDeleteTrustedJwtIssuers('zion-a', 'alpha')).toBe(
      true
    );

    expect(deleted).toEqual(['alpha/zion-a']);
  });

  test('an exact match wins over a match ignoring case, so two ids that differ only in case are never both deleted', async () => {
    world.issuers.alpha = [issuerObject('Zion'), issuerObject('zion')];

    expect(await configManagerDeleteTrustedJwtIssuers('zion', 'alpha')).toBe(
      true
    );

    expect(deleted).toEqual(['alpha/zion']);
  });

  test('matches ignoring case when there is no exact match and one candidate', async () => {
    world.issuers.alpha = [issuerObject('Zion-A')];

    expect(await configManagerDeleteTrustedJwtIssuers('zion-a', 'alpha')).toBe(
      true
    );

    expect(deleted).toEqual(['alpha/Zion-A']);
  });

  test('refuses a name that matches several ids ignoring case and none exactly', async () => {
    world.issuers.alpha = [issuerObject('Zion-A'), issuerObject('ZION-A')];

    expect(await configManagerDeleteTrustedJwtIssuers('zion-a', 'alpha')).toBe(
      false
    );

    expect(deleted).toEqual([]);
    expect(output()).toContain(
      "Trusted JWT issuer 'zion-a' matches several trusted JWT issuers in realm 'alpha' (Zion-A, ZION-A); use the exact name."
    );
  });

  test('a dry run with a name deletes nothing', async () => {
    world.issuers.alpha = [issuerObject('zion-a')];

    expect(
      await configManagerDeleteTrustedJwtIssuers('zion-a', 'alpha', true)
    ).toBe(true);

    expect(deleteIssuer).not.toHaveBeenCalled();
  });

  test.each([false, true])(
    'that does not exist fails in plain words whatever --allow-failures says (%s)',
    async (allowFailures) => {
      world.issuers.alpha = [issuerObject('zion-a')];

      expect(
        await configManagerDeleteTrustedJwtIssuers(
          'zion-missing',
          'alpha',
          false,
          allowFailures
        )
      ).toBe(false);

      expect(output()).toContain(
        "Trusted JWT issuer 'zion-missing' not found in realm 'alpha'."
      );
      expect(deleteIssuer).not.toHaveBeenCalled();
    }
  );

  test.each(['', '   '])(
    'an empty name (%j) fails before any request: it is never "all"',
    async (name) => {
      world.issuers.alpha = [issuerObject('zion-a')];

      expect(await configManagerDeleteTrustedJwtIssuers(name, 'alpha')).toBe(
        false
      );

      expect(output()).toContain(
        'The trusted JWT issuer name must not be empty. To delete all trusted JWT issuers, leave out -n.'
      );
      expect(readIssuers).not.toHaveBeenCalled();
      expect(deleteIssuer).not.toHaveBeenCalled();
    }
  );

  test('needs a single realm: with two realms it is an error before any request', async () => {
    expect(await configManagerDeleteTrustedJwtIssuers('zion-a')).toBe(false);

    expect(output()).toContain(
      'Error: for a named trusted JWT issuer, specify a single realm'
    );
    expect(readIssuers).not.toHaveBeenCalled();
  });

  test('a list that cannot be read is a failure whatever --allow-failures says', async () => {
    world.listFails.add('alpha');

    expect(
      await configManagerDeleteTrustedJwtIssuers('zion-a', 'alpha', false, true)
    ).toBe(false);
  });
});

describe('the plan', () => {
  test('lists exactly what the deletion deletes, then says what that does to the grants', async () => {
    world.issuers.alpha = [issuerObject('zion-b'), issuerObject('zion-a')];
    world.issuers.bravo = [issuerObject('zion-c')];

    expect(await showTrustedJwtIssuerDeletePlan()).toBe(true);
    const plan = printed.slice();
    printed = [];
    await configManagerDeleteTrustedJwtIssuers(undefined, undefined, true);

    expect(plan.filter((line) => line.startsWith('TEXT'))).toEqual(
      printed.filter((line) => line.startsWith('TEXT'))
    );
    expect(plan).toEqual([
      'TEXT Dry run: Deleting trusted JWT issuer: alpha/zion-a',
      'TEXT Dry run: Deleting trusted JWT issuer: alpha/zion-b',
      'TEXT Dry run: Deleting trusted JWT issuer: bravo/zion-c',
      `WARN 3 trusted JWT issuers would be deleted. ${EFFECT}`,
    ]);
    expect(deleteIssuer).not.toHaveBeenCalled();
  });

  test('says "1 trusted JWT issuer would be deleted." for one', async () => {
    world.issuers.alpha = [issuerObject('zion-a')];

    await showTrustedJwtIssuerDeletePlan(undefined, 'alpha');

    expect(output()).toContain(
      `1 trusted JWT issuer would be deleted. ${EFFECT}`
    );
  });

  test('says there is nothing to delete when no realm has an issuer', async () => {
    expect(await showTrustedJwtIssuerDeletePlan()).toBe(true);

    expect(output()).toContain('No trusted JWT issuers found to delete.');
  });

  test('is false, after printing why, when a list cannot be read', async () => {
    world.issuers.alpha = [issuerObject('zion-a')];
    world.listFails.add('bravo');

    expect(await showTrustedJwtIssuerDeletePlan()).toBe(false);

    expect(output()).toContain(
      "Error reading the trusted JWT issuers of realm 'bravo'"
    );
  });
});
