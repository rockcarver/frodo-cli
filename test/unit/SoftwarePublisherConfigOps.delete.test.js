import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

/**
 * `frodo config-manager delete oauth-software-publishers` (frodo-cli#1343), the
 * ops function behind it. The rules that every kind of the family follows (the
 * selection of a name, the plan that equals the deletion, the named and the
 * unnamed failures) are those of `deleteAgentKind` and are tested with the
 * issuer kind; what is specific here, and tested here, is what the kind gives
 * that function:
 * - the publishers of a realm are the agents of the realm whose `_type` is
 *   `SoftwarePublisher`, and an agent of another type is never listed, so never
 *   deleted;
 * - a publisher is deleted with the generic delete of the library by its id (the
 *   library has no module of its own for the type);
 * - a realm that does not offer the type has nothing to delete, and with a name
 *   it is a failure;
 * - the plan says what the deletion does to the registrations.
 *
 * The library is a fake that records its calls, the module under test and
 * OperationRun are real; nothing here contacts a tenant.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const src = (file) => path.resolve(root, 'src', file);

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

const readAgents = jest.fn();
const readAgentTypes = jest.fn();
const deleteAgent = jest.fn();

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
      getWorkingDirectory: () => '/work',
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
    agent: {
      readAgents,
      readAgentTypes,
      deleteAgent,
      importAgent: jest.fn(),
      readAgentByTypeAndId: jest.fn(),
    },
    // the issuer module that the kind takes its key set check from reads this at import
    oauth2oidc: { issuer: {} },
  },
}));

jest.unstable_mockModule(src('utils/Console'), () => ({
  printError: jest.fn((error, message) => {
    printed.push(`ERROR ${message ? `${message}: ` : ''}${error.message}`);
  }),
  printMessage: jest.fn((message, type) => {
    printed.push(`${(type ?? 'text').toUpperCase()} ${message}`);
  }),
  verboseMessage: jest.fn(),
}));

const {
  configManagerDeleteSoftwarePublishers,
  showSoftwarePublisherDeletePlan,
} = await import(src('ops/SoftwarePublisherConfigOps.ts'));

const TYPE = { _id: 'SoftwarePublisher', name: 'OAuth2 Software Publisher' };
const output = () => printed.join('\n');
const EFFECT =
  'Dynamic client registrations that present a software statement signed by one of these publishers are rejected until a software publisher for them exists again.';

beforeEach(() => {
  deployment = 'cloud';
  currentRealm = undefined;
  printed = [];
  deleted = [];
  world = {
    realms: ['/', 'alpha', 'bravo'],
    publishers: {},
    others: {},
    types: ['WebAgent', 'SoftwarePublisher'],
    listFails: new Set(),
    deleteFails: new Map(),
  };
  readAgentTypes.mockReset().mockImplementation(async () => world.types);
  readAgents.mockReset().mockImplementation(async (globalConfig) => {
    expect(globalConfig).toBe(false);
    if (world.listFails.has(currentRealm)) {
      throw new FrodoError(
        `Error reading ${currentRealm} realm agents`,
        new Error('the server answered 500')
      );
    }
    return [
      ...(world.others[currentRealm] ?? []),
      ...(world.publishers[currentRealm] ?? []).map((id) => ({
        _id: id,
        _type: TYPE,
      })),
    ];
  });
  deleteAgent.mockReset().mockImplementation(async (id) => {
    const failure = world.deleteFails.get(`${currentRealm}/${id}`);
    if (failure) {
      throw new FrodoError(
        `Error deleting ${currentRealm} realm agent ${id}`,
        new Error(failure)
      );
    }
    deleted.push(`${currentRealm}/${id}`);
  });
});
afterEach(() => {
  jest.clearAllMocks();
});

describe('deleting all software publishers', () => {
  test('deletes the publishers of every realm that has some by their id, and never an agent of another type', async () => {
    world.publishers.alpha = ['zion-b', 'zion-a'];
    world.publishers.bravo = ['matrix-publisher'];
    world.others.alpha = [
      { _id: 'zion-web-agent', _type: { _id: 'WebAgent' } },
      { _id: 'zion-gateway', _type: { _id: 'IdentityGatewayAgent' } },
    ];

    expect(await configManagerDeleteSoftwarePublishers()).toBe(true);

    expect(deleted).toEqual([
      'alpha/zion-a',
      'alpha/zion-b',
      'bravo/matrix-publisher',
    ]);
    expect(output()).toContain('Deleted software publisher: alpha/zion-a');
    expect(output()).toContain(
      'Deleted software publisher: bravo/matrix-publisher'
    );
    expect(deleteAgent).not.toHaveBeenCalledWith('zion-web-agent');
    expect(deleteAgent).not.toHaveBeenCalledWith('zion-gateway');
  });

  test('a publisher whose id has capitals and a space is deleted with exactly the id the list returned, once', async () => {
    world.publishers.alpha = ['My Publisher'];

    expect(await configManagerDeleteSoftwarePublishers()).toBe(true);

    expect(deleteAgent).toHaveBeenCalledTimes(1);
    expect(deleteAgent).toHaveBeenCalledWith('My Publisher');
    expect(deleted).toEqual(['alpha/My Publisher']);
  });

  test('a dry run deletes nothing and says what would be deleted', async () => {
    world.publishers.alpha = ['zion-a', 'zion-b'];

    expect(
      await configManagerDeleteSoftwarePublishers(undefined, undefined, true)
    ).toBe(true);

    expect(deleteAgent).not.toHaveBeenCalled();
    expect(output()).toContain(
      'Dry run: Deleting software publisher: alpha/zion-a'
    );
    expect(output()).not.toContain('Deleted');
  });

  test('nothing to delete is a success with one line', async () => {
    world.others.alpha = [
      { _id: 'zion-web-agent', _type: { _id: 'WebAgent' } },
    ];

    expect(await configManagerDeleteSoftwarePublishers()).toBe(true);

    expect(output()).toContain('No software publishers found to delete.');
    expect(deleteAgent).not.toHaveBeenCalled();
  });

  test('a publisher whose delete fails is named, the others are still deleted, and --allow-failures reports it and succeeds', async () => {
    world.publishers.alpha = ['zion-a', 'zion-b', 'zion-c'];
    world.deleteFails.set('alpha/zion-b', 'the server answered 500');

    expect(await configManagerDeleteSoftwarePublishers()).toBe(false);

    expect(deleted).toEqual(['alpha/zion-a', 'alpha/zion-c']);
    expect(output()).toContain('1 of 3 software publishers failed');
    expect(output()).toContain('alpha/zion-b: the server answered 500');

    printed = [];
    expect(
      await configManagerDeleteSoftwarePublishers(
        undefined,
        undefined,
        false,
        true
      )
    ).toBe(true);
    expect(output()).toContain('alpha/zion-b');
  });

  test('a realm whose agents cannot be listed is one failed operation named after the realm, and the other realm is deleted', async () => {
    world.publishers.bravo = ['matrix-publisher'];
    world.listFails.add('alpha');

    expect(await configManagerDeleteSoftwarePublishers()).toBe(false);

    expect(deleted).toEqual(['bravo/matrix-publisher']);
    expect(output()).toContain('realm alpha');
  });

  test('a realm that does not offer the agent type has nothing to delete: nothing is listed and the run succeeds', async () => {
    world.types = ['WebAgent'];
    world.publishers.alpha = ['zion-a'];

    expect(await configManagerDeleteSoftwarePublishers()).toBe(true);

    expect(readAgents).not.toHaveBeenCalled();
    expect(deleteAgent).not.toHaveBeenCalled();
  });
});

describe('deleting one named software publisher', () => {
  test('deletes only that publisher, by its id', async () => {
    world.publishers.alpha = ['zion-a', 'zion-b'];

    expect(await configManagerDeleteSoftwarePublishers('zion-b', 'alpha')).toBe(
      true
    );

    expect(deleted).toEqual(['alpha/zion-b']);
  });

  test.each(['My Publisher', 'my publisher', 'MY PUBLISHER'])(
    'a name typed as %p deletes the stored id "My Publisher", once, and not the name that was typed',
    async (typed) => {
      world.publishers.alpha = ['My Publisher', 'zion-a'];

      expect(await configManagerDeleteSoftwarePublishers(typed, 'alpha')).toBe(
        true
      );

      expect(deleteAgent).toHaveBeenCalledTimes(1);
      expect(deleteAgent).toHaveBeenCalledWith('My Publisher');
      expect(deleted).toEqual(['alpha/My Publisher']);
    }
  );

  test('does not delete an agent of another type that has the name, and says there is no such publisher', async () => {
    world.publishers.alpha = ['zion-a'];
    world.others.alpha = [
      { _id: 'zion-web-agent', _type: { _id: 'WebAgent' } },
    ];

    for (const allowFailures of [false, true]) {
      expect(
        await configManagerDeleteSoftwarePublishers(
          'zion-web-agent',
          'alpha',
          false,
          allowFailures
        )
      ).toBe(false);
    }

    expect(deleteAgent).not.toHaveBeenCalled();
  });

  test('in a realm that does not offer the type is a failure whatever --allow-failures says', async () => {
    world.types = ['WebAgent'];

    for (const allowFailures of [false, true]) {
      expect(
        await configManagerDeleteSoftwarePublishers(
          'zion-a',
          'alpha',
          false,
          allowFailures
        )
      ).toBe(false);
    }

    expect(output()).toContain("so 'zion-a' cannot be deleted");
    expect(deleteAgent).not.toHaveBeenCalled();
  });
});

describe('the plan', () => {
  test('lists exactly what the deletion deletes, then says what that does to the registrations', async () => {
    world.publishers.alpha = ['zion-b', 'zion-a'];
    world.publishers.bravo = ['matrix-publisher'];
    world.others.alpha = [
      { _id: 'zion-web-agent', _type: { _id: 'WebAgent' } },
    ];

    expect(await showSoftwarePublisherDeletePlan()).toBe(true);
    const plan = printed.slice();
    printed = [];
    await configManagerDeleteSoftwarePublishers(undefined, undefined, true);

    expect(plan.filter((line) => line.startsWith('TEXT'))).toEqual(
      printed.filter((line) => line.startsWith('TEXT'))
    );
    expect(plan).toEqual([
      'TEXT Dry run: Deleting software publisher: alpha/zion-a',
      'TEXT Dry run: Deleting software publisher: alpha/zion-b',
      'TEXT Dry run: Deleting software publisher: bravo/matrix-publisher',
      `WARN 3 software publishers would be deleted. ${EFFECT}`,
    ]);
    expect(deleteAgent).not.toHaveBeenCalled();
  });
});
