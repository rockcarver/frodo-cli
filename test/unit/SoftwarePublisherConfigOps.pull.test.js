import fs from 'node:fs';
import os from 'node:os';
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
 * `frodo config-manager pull oauth-software-publishers` (frodo-cli#1343): one file
 * per OAuth2 software publisher at
 * `realms/<realm>/realm-config/agents/SoftwarePublisher/<id>.json`, and the file is
 * the one `pull oauth2-agents` wrote for the same publisher before it left the type
 * to this kind, so that no tree changes (the no-movement guarantee, tested at the
 * end against the content that the committed e2e snapshot holds).
 *
 * The library has no module of its own for the type: the publishers of a realm are
 * the agents of the realm whose `_type` is `SoftwarePublisher` (`readAgents`), each
 * one is read by type and id (`readAgentByTypeAndId`: the wrapped single read), and
 * a realm offers the type when its list of agent types names it (`readAgentTypes`).
 *
 * The rules (decision records 0040 and 0041): every publisher is one operation of a
 * run that goes on after a failure; what the command line names (a publisher, a
 * single realm for it, the overrides file) must work whatever `--allow-failures`
 * says.
 *
 * The library is a fake that records its calls, the module under test and
 * OperationRun are real, the working directory is a real temporary directory, and
 * nothing here contacts a tenant.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const src = (file) => path.resolve(root, 'src', file);

let deployment;
let currentRealm;
let tmp;
let world;
let printed;
let readJsonFileCalls;

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

/** The library's `escapePlaceholders`, copied. */
const escapePlaceholders = (content) =>
  JSON.parse(JSON.stringify(content).replace(/\$\{/g, '\\\\${'));

/** The library's `mergeDeep`, copied: arrays merge element by element. */
function mergeDeep(obj1, obj2) {
  if (obj1) {
    for (const key of Object.keys(obj2)) {
      if (!obj1.hasOwnProperty(key) || typeof obj2[key] !== 'object') {
        obj1[key] = obj2[key];
      } else {
        mergeDeep(obj1[key], obj2[key]);
      }
    }
  }
  return obj1;
}

const readAgents = jest.fn();
const readAgentTypes = jest.fn();
const readAgentByTypeAndId = jest.fn();
const readApplicationOwnership = jest.fn();

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
      getFilePath: (relative, create) => {
        const target = path.join(tmp, relative);
        if (create) fs.mkdirSync(path.dirname(target), { recursive: true });
        return target;
      },
      getWorkingDirectory: () => tmp,
      // what the real one writes: the data without `_rev` (keepRev false)
      saveJsonToFile: (data, filename, includeMeta, keepRev) => {
        const copy = structuredClone(data);
        if (!keepRev) delete copy._rev;
        fs.writeFileSync(filename, JSON.stringify(copy, null, 2));
      },
      readJsonFile: (file, resolvePlaceholders = true) => {
        readJsonFileCalls.push({ file, resolvePlaceholders });
        try {
          return JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (error) {
          throw new FrodoError(`Error reading file ${file}`, error);
        }
      },
      escapePlaceholders,
      findFilesByName: jest.fn(),
      isBase64Encoded: jest.fn(),
      json: { mergeDeep },
    },
    realm: {
      readRealms: jest.fn(async () => world.realms.map((name) => ({ name }))),
    },
    agent: {
      readAgents,
      readAgentTypes,
      readAgentByTypeAndId,
      importAgent: jest.fn(),
      deleteAgent: jest.fn(),
    },
    app: { readApplicationOwnership, getApplicationOwners: jest.fn() },
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
  createProgressIndicator: jest.fn(),
  stopProgressIndicator: jest.fn(),
}));

jest.unstable_mockModule(src('utils/SettingsStore'), () => ({
  CONFIG_MANAGER_APPLICATION_LAYOUTS: ['folders', 'kind-paths'],
  getConfigManagerApplicationLayout: () => 'kind-paths',
}));

const { configManagerExportSoftwarePublishers, softwarePublisherFilePath } =
  await import(src('ops/SoftwarePublisherConfigOps.ts'));
const { configManagerExportOAuth2Agents } = await import(
  src('configManagerOps/FrConfigOauth2AgentOps.ts')
);

const output = () => printed.join('\n');
const exists = (relative) => fs.existsSync(path.join(tmp, relative));
const read = (relative) =>
  JSON.parse(fs.readFileSync(path.join(tmp, relative), 'utf8'));
const readRaw = (relative) => fs.readFileSync(path.join(tmp, relative), 'utf8');
const writeFile = (relative, content) => {
  const target = path.join(tmp, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(content));
  return target;
};

const TYPE = {
  _id: 'SoftwarePublisher',
  collection: true,
  name: 'OAuth2 Software Publisher',
};

/** A publisher as the single read returns it: every property wrapped, with `_rev`. */
const publisherObject = (id, extra = {}) => ({
  _id: id,
  _rev: '-1234',
  _type: TYPE,
  issuer: { inherited: false, value: `https://${id}.example.com` },
  jwkSet: { inherited: false },
  jwksUri: { inherited: false, value: `https://${id}.example.com/jwks` },
  publicKeyLocation: { inherited: false, value: 'jwks_uri' },
  ...extra,
});

const P = (id, realm = 'alpha') => softwarePublisherFilePath(realm, id);

beforeEach(() => {
  deployment = 'cloud';
  currentRealm = undefined;
  printed = [];
  readJsonFileCalls = [];
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-publisher-pull-'));
  world = {
    realms: ['/', 'alpha', 'bravo'],
    publishers: {},
    others: {},
    types: ['IdentityGatewayAgent', 'WebAgent', 'SoftwarePublisher'],
    listFails: new Set(),
    readFails: new Map(),
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
    // the list read is plain, with null for unset values: only the ids and the types are used
    return [
      ...(world.others[currentRealm] ?? []),
      ...(world.publishers[currentRealm] ?? []).map(({ _id }) => ({
        _id,
        _type: TYPE,
        issuer: null,
      })),
    ];
  });
  readAgentByTypeAndId.mockReset().mockImplementation(async (type, id) => {
    expect(type).toBe('SoftwarePublisher');
    const failure = world.readFails.get(`${currentRealm}/${id}`);
    if (failure) {
      throw new FrodoError(
        `Error reading ${currentRealm} realm agent ${id} of type ${type}`,
        new Error(failure)
      );
    }
    const found = (world.publishers[currentRealm] ?? []).find(
      (p) => p._id === id
    );
    if (!found) {
      throw new FrodoError(
        `Error reading ${currentRealm} realm agent ${id} of type ${type}`,
        new Error('Not Found')
      );
    }
    return structuredClone(found);
  });
  readApplicationOwnership.mockReset().mockResolvedValue({ entries: [] });
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('the file of a software publisher', () => {
  test('is at realms/<realm>/realm-config/agents/SoftwarePublisher/<id>.json', () => {
    expect(P('zion-publisher')).toBe(
      'realms/alpha/realm-config/agents/SoftwarePublisher/zion-publisher.json'
    );
    expect(P('zion-publisher', '/')).toBe(
      'realms/root/realm-config/agents/SoftwarePublisher/zion-publisher.json'
    );
  });
});

describe('Cloud: realms alpha and bravo', () => {
  test('lists the agents of each realm once, keeps the publishers, reads each one by type and id, and writes the single read in the plain shape without _rev and with ${ escaped', async () => {
    world.publishers.alpha = [
      publisherObject('zion-publisher', {
        jwksUri: { inherited: false, value: 'https://${HOST}/jwks' },
      }),
      publisherObject('zion-other'),
    ];
    // agents of other types are in the same list and are never read
    world.others.alpha = [
      { _id: 'zion-web-agent', _type: { _id: 'WebAgent' } },
      { _id: 'zion-gateway', _type: { _id: 'IdentityGatewayAgent' } },
    ];

    expect(await configManagerExportSoftwarePublishers()).toBe(true);

    const written = read(P('zion-publisher'));
    // the plain shape (record 0054): a property that is set is its value, one that is not set is not there
    expect(written.issuer).toBe('https://zion-publisher.example.com');
    expect(written.publicKeyLocation).toBe('jwks_uri');
    expect(written).not.toHaveProperty('jwkSet');
    expect(readRaw(P('zion-other'))).not.toContain('inherited');
    expect(written).not.toHaveProperty('_rev');
    expect(readRaw(P('zion-publisher'))).toContain('https://\\\\${HOST}/jwks');
    expect(exists(P('zion-other'))).toBe(true);
    expect(exists(P('zion-web-agent'))).toBe(false);
    expect(exists('realms/bravo')).toBe(false);
    // the root realm of a Cloud tenant is not visited; one list per realm, one read per publisher
    expect(readAgents).toHaveBeenCalledTimes(2);
    expect(readAgentByTypeAndId.mock.calls.map(([, id]) => id).sort()).toEqual([
      'zion-other',
      'zion-publisher',
    ]);
    expect(output()).not.toContain('No software publishers found.');
  });

  test('says "No software publishers found." once per run', async () => {
    world.others.alpha = [
      { _id: 'zion-web-agent', _type: { _id: 'WebAgent' } },
    ];

    expect(await configManagerExportSoftwarePublishers()).toBe(true);

    expect(
      printed.filter((line) => line.includes('No software publishers found.'))
    ).toHaveLength(1);
    expect(readAgentByTypeAndId).not.toHaveBeenCalled();
  });

  test('the step of pull all (quiet) says nothing when there is nothing to export', async () => {
    expect(
      await configManagerExportSoftwarePublishers(undefined, undefined, true)
    ).toBe(true);

    expect(output()).toBe('');
  });
});

describe('the root realm', () => {
  test('of a Cloud tenant given as the realm is a message and a success without a name, a failure with one', async () => {
    expect(await configManagerExportSoftwarePublishers(undefined, '/')).toBe(
      true
    );
    expect(output()).toContain(
      'The root realm of an Identity Cloud tenant has no software publishers.'
    );
    expect(
      await configManagerExportSoftwarePublishers('zion-publisher', '/')
    ).toBe(false);
    expect(readAgents).not.toHaveBeenCalled();
  });

  test.each(['forgeops', 'classic'])(
    'of %s is visited and its files go to the folder root',
    async (shape) => {
      deployment = shape;
      world.publishers['/'] = [publisherObject('zion-root')];

      expect(await configManagerExportSoftwarePublishers()).toBe(true);

      expect(exists(P('zion-root', '/'))).toBe(true);
      expect(exists('realms/root/realm-config/agents/SoftwarePublisher')).toBe(
        true
      );
    }
  );
});

describe('a realm that does not offer the agent type', () => {
  beforeEach(() => {
    world.types = ['IdentityGatewayAgent', 'WebAgent'];
    world.publishers.alpha = [publisherObject('zion-publisher')];
  });

  test('is a non-event: nothing is listed or read, one message, and the run succeeds', async () => {
    expect(await configManagerExportSoftwarePublishers()).toBe(true);

    expect(readAgents).not.toHaveBeenCalled();
    expect(readAgentByTypeAndId).not.toHaveBeenCalled();
    expect(exists(P('zion-publisher'))).toBe(false);
    expect(output()).toContain(
      "Software publishers are not available in realm 'alpha' of this deployment."
    );
  });

  test('says nothing in the step of pull all (quiet)', async () => {
    expect(
      await configManagerExportSoftwarePublishers(undefined, undefined, true)
    ).toBe(true);

    expect(output()).toBe('');
  });

  test('is a failure when a publisher was asked for by name: the name must exist', async () => {
    expect(
      await configManagerExportSoftwarePublishers('zion-publisher', 'alpha')
    ).toBe(false);

    expect(readAgentByTypeAndId).not.toHaveBeenCalled();
    expect(output()).toContain("so 'zion-publisher' cannot be pulled");
  });

  test('is a failed realm when its list of agent types cannot be read, and the other realms are still pulled', async () => {
    world.types = ['WebAgent', 'SoftwarePublisher'];
    world.publishers.bravo = [publisherObject('matrix-publisher', {})];
    readAgentTypes.mockImplementation(async () => {
      if (currentRealm === 'alpha') {
        throw new FrodoError(
          'Error reading agent types',
          new Error('the server answered 500')
        );
      }
      return world.types;
    });

    expect(await configManagerExportSoftwarePublishers()).toBe(false);

    expect(exists(P('matrix-publisher', 'bravo'))).toBe(true);
    expect(output()).toContain('realm alpha');
  });
});

describe('one publisher by name', () => {
  test('is read by its name without listing the realm', async () => {
    world.publishers.alpha = [
      publisherObject('zion-publisher'),
      publisherObject('zion-other'),
    ];

    expect(
      await configManagerExportSoftwarePublishers('zion-publisher', 'alpha')
    ).toBe(true);

    expect(readAgents).not.toHaveBeenCalled();
    expect(readAgentByTypeAndId).toHaveBeenCalledTimes(1);
    expect(readAgentByTypeAndId).toHaveBeenCalledWith(
      'SoftwarePublisher',
      'zion-publisher'
    );
    expect(exists(P('zion-publisher'))).toBe(true);
    expect(exists(P('zion-other'))).toBe(false);
  });

  test('that does not exist fails the command, whatever --allow-failures says', async () => {
    for (const allowFailures of [false, true]) {
      expect(
        await configManagerExportSoftwarePublishers(
          'missing',
          'alpha',
          false,
          allowFailures
        )
      ).toBe(false);
    }
    expect(output()).toContain('Not Found');
  });

  test('needs a single realm', async () => {
    expect(await configManagerExportSoftwarePublishers('zion-publisher')).toBe(
      false
    );

    expect(output()).toContain(
      'Error: for a named software publisher, specify a single realm'
    );
    expect(readAgentByTypeAndId).not.toHaveBeenCalled();
  });
});

describe('failures', () => {
  test('a realm whose agents cannot be listed is one failed operation, and the other realms are still pulled', async () => {
    world.publishers.bravo = [publisherObject('matrix-publisher')];
    world.listFails.add('alpha');

    expect(await configManagerExportSoftwarePublishers()).toBe(false);

    expect(exists(P('matrix-publisher', 'bravo'))).toBe(true);
    expect(output()).toContain('realm alpha');
    expect(output()).toContain('the server answered 500');
  });

  test('--allow-failures reports the failed realm and succeeds', async () => {
    world.listFails.add('alpha');

    expect(
      await configManagerExportSoftwarePublishers(
        undefined,
        undefined,
        false,
        true
      )
    ).toBe(true);

    expect(output()).toContain('realm alpha');
  });

  test('a publisher that cannot be read is named, and the others are still written', async () => {
    world.publishers.alpha = [
      publisherObject('zion-bad'),
      publisherObject('zion-good'),
    ];
    world.readFails.set('alpha/zion-bad', 'the server answered 500');

    expect(await configManagerExportSoftwarePublishers()).toBe(false);

    expect(exists(P('zion-good'))).toBe(true);
    expect(exists(P('zion-bad'))).toBe(false);
    expect(output()).toContain('alpha/zion-bad');
  });
});

describe('the overrides file', () => {
  test.each([
    ['plain', (value) => value],
    [
      '{ value } (the help of the first 5.0.0 prereleases)',
      (value) => ({ value }),
    ],
    ['{ inherited: false, value }', (value) => ({ inherited: false, value })],
  ])(
    'replaces the values it names with its placeholders, in the plain shape of the file, whether an override is written as %s',
    async (_form, as) => {
      world.publishers.alpha = [publisherObject('zion-publisher')];
      const overrides = writeFile('config/oauth-software-publishers.json', {
        alpha: [
          {
            id: 'zion-publisher',
            overrides: {
              jwksUri: as('${ZION_PUBLISHER_JWKS_URI}'),
            },
          },
        ],
      });

      expect(
        await configManagerExportSoftwarePublishers(
          undefined,
          undefined,
          false,
          false,
          overrides
        )
      ).toBe(true);

      const written = read(P('zion-publisher'));
      expect(written.jwksUri).toBe('${ZION_PUBLISHER_JWKS_URI}');
      // what the overrides do not name is the read
      expect(written.issuer).toBe('https://zion-publisher.example.com');
      expect(readRaw(P('zion-publisher'))).not.toContain('inherited');
    }
  );
});

describe('private and secret key material in the key set', () => {
  const jwk = (members) =>
    JSON.stringify({ keys: [{ kty: 'RSA', ...members }] });

  test.each([
    ['a private key (d)', { d: 'private-part' }],
    ['a symmetric key (k)', { kty: 'oct', k: 'symmetric-part' }],
  ])(
    '%s is a warning that names the publisher and never prints the key',
    async (_what, members) => {
      world.publishers.alpha = [
        publisherObject('zion-publisher', {
          jwkSet: { inherited: false, value: jwk(members) },
        }),
      ];

      expect(await configManagerExportSoftwarePublishers()).toBe(true);

      expect(output()).toContain(
        "WARN Software publisher 'zion-publisher' of realm 'alpha' stores private or secret key material in jwkSet; the file contains it. Replace it with a placeholder in the overrides file."
      );
      for (const secret of ['private-part', 'symmetric-part']) {
        expect(output()).not.toContain(secret);
      }
      // the publisher is still written: the user asked for it
      expect(exists(P('zion-publisher'))).toBe(true);
    }
  );

  test('public members only are silent', async () => {
    world.publishers.alpha = [
      publisherObject('zion-publisher', {
        jwkSet: {
          inherited: false,
          value: jwk({ n: 'modulus', e: 'AQAB', kid: 'k1', use: 'sig' }),
        },
      }),
    ];

    expect(await configManagerExportSoftwarePublishers()).toBe(true);

    expect(output()).toBe('');
  });
});

describe('the no-movement guarantee: the file is at the path where pull oauth2-agents wrote it before it left software publishers to this kind (frodo-cli#1343), in the plain shape of record 0054', () => {
  // The content that the committed e2e snapshot of `pull oauth2-agents` holds for the publisher of the recorded tenant
  // (test/e2e/__snapshots__/config-manager-pull-oauth2-agents.e2e.test.js.snap, entry "test software publisher"), the
  // single read of the type: every property wrapped (the answer the pull reads; the file it writes is plain).
  const committed = {
    _id: 'test software publisher',
    _type: TYPE,
    issuer: { inherited: false },
    jwkSet: { inherited: false },
    jwkStoreCacheMissCacheTime: { inherited: false, value: 60000 },
    jwksCacheTimeout: { inherited: false, value: 3600000 },
    jwksUri: { inherited: false },
    publicKeyLocation: { inherited: false, value: 'jwks_uri' },
    softwareStatementSigningAlgorithm: { inherited: false, value: 'RS256' },
  };

  test('the dedicated kind writes the committed publisher to the same path, and the generic route no longer writes it', async () => {
    world.publishers.alpha = [{ ...committed, _rev: '-77' }];

    // the generic route skips the type: nothing is read, nothing is written
    const configFile = writeFile('config/oauth2-agents.json', {
      alpha: { SoftwarePublisher: [{ id: 'test software publisher' }] },
    });
    expect(await configManagerExportOAuth2Agents(configFile)).toBe(true);
    expect(exists(P('test software publisher'))).toBe(false);
    expect(readAgentByTypeAndId).not.toHaveBeenCalled();

    // the dedicated kind writes the file where the generic route used to write it
    expect(
      await configManagerExportSoftwarePublishers(undefined, 'alpha')
    ).toBe(true);

    // what is set on the publisher as its value, and nothing for the three properties that are not set
    expect(JSON.parse(readRaw(P('test software publisher')))).toEqual({
      _id: 'test software publisher',
      _type: TYPE,
      jwkStoreCacheMissCacheTime: 60000,
      jwksCacheTimeout: 3600000,
      publicKeyLocation: 'jwks_uri',
      softwareStatementSigningAlgorithm: 'RS256',
    });
    // a name with a space is a file name of its own, as the generic route wrote it
    expect(P('test software publisher')).toBe(
      'realms/alpha/realm-config/agents/SoftwarePublisher/test software publisher.json'
    );
  });
});
