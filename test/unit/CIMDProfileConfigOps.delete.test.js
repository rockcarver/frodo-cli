import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

/**
 * `frodo config-manager delete oauth-cimd-profiles` (frodo-cli#1251): the profiles are
 * read first (the plan, the dry run and the answer "not found" for a name come
 * from that list, because the server answers 404 for a profile that is gone and
 * for one that never was), then deleted one by one by their stored id, every
 * deletion one operation of a run that goes on after a failure (decision record
 * 0040). A name that is empty, a name without a single realm and a named profile
 * that does not exist fail whatever `--allow-failures` says (record 0041). The
 * guard that asks before a bulk delete belongs to the command and is tested with
 * it (ConfigManagerDeleteCimdProfilesCommand.test.js and the guard test of the
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

const isAvailable = jest.fn();
const readCIMDProfiles = jest.fn();
const deleteCIMDProfile = jest.fn();

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
      cimd: {
        isCIMDProfileAvailable: isAvailable,
        readCIMDProfiles,
        deleteCIMDProfile,
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

const { configManagerDeleteCIMDProfiles, showCIMDProfileDeletePlan } =
  await import('../../src/ops/CIMDProfileConfigOps.ts');

const output = () => printed.join('\n');
const profile = (id) => ({ _id: id, _rev: '-1' });
const EFFECT =
  'A client that identifies itself with a Client ID Metadata Document that only these profiles allow is rejected (invalid_client) until a profile for it exists again.';

beforeEach(() => {
  deployment = 'cloud';
  currentRealm = undefined;
  printed = [];
  deleted = [];
  world = {
    realms: ['/', 'alpha', 'bravo'],
    offers: new Set(['/', 'alpha', 'bravo']),
    profiles: {},
    listFails: new Set(),
    deleteFails: new Map(),
  };
  isAvailable.mockReset().mockImplementation(async () => {
    return world.offers.has(currentRealm);
  });
  readCIMDProfiles.mockReset().mockImplementation(async () => {
    if (world.listFails.has(currentRealm)) {
      throw new FrodoError(
        `Error reading ${currentRealm} realm CIMD profiles`,
        new Error('the server answered 500')
      );
    }
    return structuredClone(world.profiles[currentRealm] ?? []);
  });
  deleteCIMDProfile.mockReset().mockImplementation(async (id) => {
    const failure = world.deleteFails.get(`${currentRealm}/${id}`);
    if (failure) {
      throw new FrodoError(
        `Error deleting ${currentRealm} realm CIMD profile ${id}`,
        new Error(failure)
      );
    }
    deleted.push(`${currentRealm}/${id}`);
    return profile(id);
  });
});
afterEach(() => {
  jest.clearAllMocks();
});

describe('deleting all CIMD profiles', () => {
  test('deletes every profile of every realm that has some, saying so for each, and nothing for a realm without', async () => {
    world.profiles.alpha = [
      profile('zion-b'),
      profile('zion-a'),
      profile('zion-c'),
    ];

    expect(await configManagerDeleteCIMDProfiles()).toBe(true);

    // in the order of the ids; the root realm of a Cloud tenant is not visited
    expect(deleted).toEqual(['alpha/zion-a', 'alpha/zion-b', 'alpha/zion-c']);
    expect(output()).toContain('Deleted CIMD profile: alpha/zion-a');
    expect(output()).toContain('Deleted CIMD profile: alpha/zion-b');
    expect(output()).toContain('Deleted CIMD profile: alpha/zion-c');
    expect(isAvailable).toHaveBeenCalledTimes(2);
    expect(output()).not.toContain('failed');
  });

  test('a dry run deletes nothing and says what would be deleted', async () => {
    world.profiles.alpha = [profile('zion-a'), profile('zion-b')];

    expect(
      await configManagerDeleteCIMDProfiles(undefined, undefined, true)
    ).toBe(true);

    expect(deleteCIMDProfile).not.toHaveBeenCalled();
    expect(output()).toContain('Dry run: Deleting CIMD profile: alpha/zion-a');
    expect(output()).toContain('Dry run: Deleting CIMD profile: alpha/zion-b');
    expect(output()).not.toContain('Deleted');
  });

  test('nothing to delete without a name is a success with one line', async () => {
    expect(await configManagerDeleteCIMDProfiles()).toBe(true);

    expect(output()).toContain('No CIMD profiles found to delete.');
    expect(deleteCIMDProfile).not.toHaveBeenCalled();
  });

  test('one deletion that fails is named in one summary, the others are deleted, --allow-failures keeps the exit code at 0', async () => {
    world.profiles.alpha = [
      profile('zion-a'),
      profile('zion-b'),
      profile('zion-c'),
    ];
    world.deleteFails.set('alpha/zion-b', 'the server answered 500');

    expect(await configManagerDeleteCIMDProfiles()).toBe(false);

    expect(deleted).toEqual(['alpha/zion-a', 'alpha/zion-c']);
    expect(output()).toContain('1 of 3 CIMD profiles failed');
    expect(output()).toContain('alpha/zion-b: the server answered 500');

    printed = [];
    expect(
      await configManagerDeleteCIMDProfiles(undefined, undefined, false, true)
    ).toBe(true);
    expect(output()).toContain('alpha/zion-b');
    expect(output()).toContain('The exit code stays 0');
  });

  test('a realm whose profiles cannot be read is one failed operation named after the realm, and the other realm is deleted', async () => {
    world.profiles.alpha = [profile('zion-a')];
    world.profiles.bravo = [profile('zion-b')];
    world.listFails.add('bravo');

    expect(await configManagerDeleteCIMDProfiles()).toBe(false);

    expect(deleted).toEqual(['alpha/zion-a']);
    expect(output()).toContain('realm bravo');
    expect(output()).not.toContain('No CIMD profiles found to delete.');
  });

  test('a realm that does not offer the type has nothing to delete: no failure, no request for profiles', async () => {
    world.offers = new Set(['bravo']);
    world.profiles.alpha = [profile('zion-a')];
    world.profiles.bravo = [profile('zion-b')];

    expect(await configManagerDeleteCIMDProfiles()).toBe(true);

    expect(deleted).toEqual(['bravo/zion-b']);
    expect(readCIMDProfiles).toHaveBeenCalledTimes(1);
  });

  test('a deployment that does not offer the type at all is a success that deletes nothing', async () => {
    world.offers = new Set();

    expect(await configManagerDeleteCIMDProfiles()).toBe(true);

    expect(readCIMDProfiles).not.toHaveBeenCalled();
    expect(deleteCIMDProfile).not.toHaveBeenCalled();
    expect(output()).not.toContain('failed');
  });

  test.each(['forgeops', 'classic'])(
    'on %s the root realm is visited, and the output names it root',
    async (shape) => {
      deployment = shape;
      world.profiles['/'] = [profile('zion-root')];

      expect(await configManagerDeleteCIMDProfiles()).toBe(true);

      expect(deleted).toEqual(['//zion-root']);
      expect(output()).toContain('Deleted CIMD profile: root/zion-root');
    }
  );

  test('the root realm of a Cloud tenant given as the realm is a message and a success', async () => {
    world.profiles['/'] = [profile('zion-root')];

    expect(await configManagerDeleteCIMDProfiles(undefined, '/')).toBe(true);

    expect(output()).toContain(
      'The root realm of an Identity Cloud tenant has no CIMD profiles.'
    );
    expect(readCIMDProfiles).not.toHaveBeenCalled();
  });
});

describe('deleting one named CIMD profile', () => {
  test('deletes only that profile, by its stored id, matched ignoring case', async () => {
    world.profiles.alpha = [profile('zion-agents'), profile('zion-tools')];

    expect(await configManagerDeleteCIMDProfiles('Zion-Agents', 'alpha')).toBe(
      true
    );

    expect(deleted).toEqual(['alpha/zion-agents']);
  });

  test('finds a profile with a character outside the basic multilingual plane, because it is picked from the list', async () => {
    const id = 'zion-\u{1F916}';
    world.profiles.alpha = [profile(id)];

    expect(await configManagerDeleteCIMDProfiles(id, 'alpha')).toBe(true);

    expect(deleted).toEqual([`alpha/${id}`]);
  });

  test('a dry run with a name deletes nothing', async () => {
    world.profiles.alpha = [profile('zion-agents')];

    expect(
      await configManagerDeleteCIMDProfiles('zion-agents', 'alpha', true)
    ).toBe(true);

    expect(deleteCIMDProfile).not.toHaveBeenCalled();
    expect(output()).toContain(
      'Dry run: Deleting CIMD profile: alpha/zion-agents'
    );
  });

  test.each([false, true])(
    'that does not exist fails in plain words whatever --allow-failures says (%s)',
    async (allowFailures) => {
      world.profiles.alpha = [profile('zion-agents')];

      expect(
        await configManagerDeleteCIMDProfiles(
          'zion-missing',
          'alpha',
          false,
          allowFailures
        )
      ).toBe(false);

      expect(output()).toContain(
        "CIMD profile 'zion-missing' not found in realm 'alpha'."
      );
      expect(deleteCIMDProfile).not.toHaveBeenCalled();
    }
  );

  test.each(['', '   '])(
    'an empty name (%j) fails before any request: it is never "all"',
    async (name) => {
      world.profiles.alpha = [profile('zion-agents')];

      expect(await configManagerDeleteCIMDProfiles(name, 'alpha')).toBe(false);

      expect(output()).toContain(
        'The CIMD profile name must not be empty. To delete all CIMD profiles, leave out -n.'
      );
      expect(isAvailable).not.toHaveBeenCalled();
      expect(readCIMDProfiles).not.toHaveBeenCalled();
      expect(deleteCIMDProfile).not.toHaveBeenCalled();
    }
  );

  test('needs a single realm: with two realms it is an error before any request', async () => {
    expect(await configManagerDeleteCIMDProfiles('zion-agents')).toBe(false);

    expect(output()).toContain(
      'Error: for a named CIMD profile, specify a single realm'
    );
    expect(isAvailable).not.toHaveBeenCalled();
    expect(deleteCIMDProfile).not.toHaveBeenCalled();
  });

  test.each([false, true])(
    'in a realm that does not offer the type fails in plain words whatever --allow-failures says (%s)',
    async (allowFailures) => {
      world.offers = new Set();

      expect(
        await configManagerDeleteCIMDProfiles(
          'zion-agents',
          'alpha',
          false,
          allowFailures
        )
      ).toBe(false);

      expect(output()).toContain(
        "CIMD profiles are not available in realm 'alpha' of this deployment, so 'zion-agents' cannot be deleted."
      );
      expect(readCIMDProfiles).not.toHaveBeenCalled();
    }
  );

  test('a failed deletion of the named profile is a failure, and --allow-failures does not make it a success of the name', async () => {
    world.profiles.alpha = [profile('zion-agents')];
    world.deleteFails.set('alpha/zion-agents', 'the server answered 500');

    expect(await configManagerDeleteCIMDProfiles('zion-agents', 'alpha')).toBe(
      false
    );
    expect(output()).toContain('alpha/zion-agents: the server answered 500');
  });

  test('a list that cannot be read is a failure whatever --allow-failures says', async () => {
    world.listFails.add('alpha');

    expect(
      await configManagerDeleteCIMDProfiles('zion-agents', 'alpha', false, true)
    ).toBe(false);
  });
});

describe('the plan', () => {
  test('lists exactly what the deletion deletes, then says what that does to the clients', async () => {
    world.profiles.alpha = [profile('zion-b'), profile('zion-a')];
    world.profiles.bravo = [profile('zion-c')];

    expect(await showCIMDProfileDeletePlan()).toBe(true);
    const plan = printed.filter(
      (line) =>
        line.startsWith('INFO') ||
        line.startsWith('TEXT') ||
        line.startsWith('WARN')
    );
    printed = [];
    await configManagerDeleteCIMDProfiles(undefined, undefined, true);
    const dryRun = printed.filter((line) => line.startsWith('TEXT'));

    expect(plan.filter((line) => line.startsWith('TEXT'))).toEqual(dryRun);
    expect(plan).toEqual([
      'TEXT Dry run: Deleting CIMD profile: alpha/zion-a',
      'TEXT Dry run: Deleting CIMD profile: alpha/zion-b',
      'TEXT Dry run: Deleting CIMD profile: bravo/zion-c',
      `WARN 3 CIMD profiles would be deleted. ${EFFECT}`,
    ]);
    expect(deleteCIMDProfile).not.toHaveBeenCalled();
  });

  test('says "1 CIMD profile would be deleted." for one', async () => {
    world.profiles.alpha = [profile('zion-a')];

    await showCIMDProfileDeletePlan(undefined, 'alpha');

    expect(output()).toContain(`1 CIMD profile would be deleted. ${EFFECT}`);
  });

  test('for a name shows that profile only', async () => {
    world.profiles.alpha = [profile('zion-a'), profile('zion-b')];

    expect(await showCIMDProfileDeletePlan('ZION-B', 'alpha')).toBe(true);

    expect(output()).toContain('Dry run: Deleting CIMD profile: alpha/zion-b');
    expect(output()).not.toContain('zion-a');
  });

  test('says there is nothing to delete when no realm has a profile', async () => {
    expect(await showCIMDProfileDeletePlan()).toBe(true);

    expect(output()).toContain('No CIMD profiles found to delete.');
    expect(output()).not.toContain('would be deleted');
  });

  test('is false, after printing why, when a list cannot be read', async () => {
    world.profiles.alpha = [profile('zion-a')];
    world.listFails.add('bravo');

    expect(await showCIMDProfileDeletePlan()).toBe(false);

    expect(output()).toContain(
      "Error reading the CIMD profiles of realm 'bravo'"
    );
  });

  test('is false for a name that does not exist, and for an empty name', async () => {
    world.profiles.alpha = [profile('zion-a')];

    expect(await showCIMDProfileDeletePlan('zion-missing', 'alpha')).toBe(
      false
    );
    expect(await showCIMDProfileDeletePlan('', 'alpha')).toBe(false);
  });
});
