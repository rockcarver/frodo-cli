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
 * `frodo config-manager pull oauth-issuers` (frodo-cli#1255): one file per
 * OAuth2 trusted JWT issuer at
 * `realms/<realm>/realm-config/agents/TrustedJwtIssuer/<id>.json`, and the file is
 * the one `pull oauth2-agents` writes for the same issuer today, so that no tree
 * changes (the no-movement guarantee, tested at the end against the committed
 * fixture of the e2e exports).
 *
 * The rules (decision records 0040 and 0041): every issuer is one operation of a
 * run that goes on after a failure; what the command line names (an issuer, a
 * single realm for it, the overrides file) must work whatever `--allow-failures`
 * says. The type exists on every deployment, so unlike CIMD profiles there is no
 * availability check: a realm that cannot be read is a failed realm.
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

const readIssuers = jest.fn();
const readIssuer = jest.fn();
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
    agent: { readAgentByTypeAndId, importAgent: jest.fn() },
    app: { readApplicationOwnership, getApplicationOwners: jest.fn() },
    oauth2oidc: {
      issuer: {
        readOAuth2TrustedJwtIssuers: readIssuers,
        readOAuth2TrustedJwtIssuer: readIssuer,
      },
    },
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

const {
  configManagerExportTrustedJwtIssuers,
  holdsSecretKeyMaterial,
  trustedJwtIssuerFilePath,
} = await import(src('ops/OAuth2TrustedJwtIssuerConfigOps.ts'));
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

/** An issuer as the single read returns it: every property wrapped, with `_rev`. */
const issuerObject = (id, extra = {}) => ({
  _id: id,
  _rev: '-1234',
  _type: {
    _id: 'TrustedJwtIssuer',
    collection: true,
    name: 'OAuth2 Trusted JWT Issuer',
  },
  allowedSubjects: { inherited: false, value: [] },
  issuer: { inherited: false, value: `https://${id}.example.com` },
  jwksUri: { inherited: false },
  ...extra,
});

const P = (id, realm = 'alpha') => trustedJwtIssuerFilePath(realm, id);

beforeEach(() => {
  deployment = 'cloud';
  currentRealm = undefined;
  printed = [];
  readJsonFileCalls = [];
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-issuer-pull-'));
  world = {
    realms: ['/', 'alpha', 'bravo'],
    issuers: {},
    listFails: new Set(),
    readFails: new Map(),
  };
  readIssuers.mockReset().mockImplementation(async () => {
    if (world.listFails.has(currentRealm)) {
      throw new FrodoError(
        `Error reading ${currentRealm} realm trusted issuers`,
        new Error('the server answered 500')
      );
    }
    // the list read is plain, with null for unset values: only the ids are used
    return (world.issuers[currentRealm] ?? []).map(({ _id }) => ({ _id }));
  });
  readIssuer.mockReset().mockImplementation(async (id) => {
    const failure = world.readFails.get(`${currentRealm}/${id}`);
    if (failure) {
      throw new FrodoError(
        `Error reading ${currentRealm} realm trusted issuer ${id}`,
        new Error(failure)
      );
    }
    const found = (world.issuers[currentRealm] ?? []).find((i) => i._id === id);
    if (!found) {
      throw new FrodoError(
        `Error reading ${currentRealm} realm trusted issuer ${id}`,
        new Error('Not Found')
      );
    }
    return structuredClone(found);
  });
  readAgentByTypeAndId.mockReset().mockImplementation(async (type, id) => {
    return structuredClone(
      (world.issuers[currentRealm] ?? []).find((i) => i._id === id)
    );
  });
  readApplicationOwnership.mockReset().mockResolvedValue({ entries: [] });
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('the file of a trusted JWT issuer', () => {
  test('is at realms/<realm>/realm-config/agents/TrustedJwtIssuer/<id>.json', () => {
    expect(P('zion-issuer')).toBe(
      'realms/alpha/realm-config/agents/TrustedJwtIssuer/zion-issuer.json'
    );
    expect(P('zion-issuer', '/')).toBe(
      'realms/root/realm-config/agents/TrustedJwtIssuer/zion-issuer.json'
    );
  });
});

describe('Cloud: realms alpha and bravo', () => {
  test('lists the issuers of each realm once, reads each one, and writes the single read without _rev and with ${ escaped', async () => {
    world.issuers.alpha = [
      issuerObject('zion-issuer', {
        jwksUri: { inherited: false, value: 'https://${HOST}/jwks' },
      }),
      issuerObject('zion-other'),
    ];

    expect(await configManagerExportTrustedJwtIssuers()).toBe(true);

    const written = read(P('zion-issuer'));
    // the wrapped form of the single read, kept as it is
    expect(written.issuer).toEqual({
      inherited: false,
      value: 'https://zion-issuer.example.com',
    });
    expect(written).not.toHaveProperty('_rev');
    expect(readRaw(P('zion-issuer'))).toContain('https://\\\\${HOST}/jwks');
    expect(exists(P('zion-other'))).toBe(true);
    expect(exists('realms/bravo')).toBe(false);
    // the root realm of a Cloud tenant is not visited; one list per realm, one read per issuer
    expect(readIssuers).toHaveBeenCalledTimes(2);
    expect(readIssuer.mock.calls.map(([id]) => id).sort()).toEqual([
      'zion-issuer',
      'zion-other',
    ]);
    expect(output()).not.toContain('No trusted JWT issuers found.');
  });

  test('says "No trusted JWT issuers found." once per run', async () => {
    expect(await configManagerExportTrustedJwtIssuers()).toBe(true);

    expect(
      printed.filter((line) => line.includes('No trusted JWT issuers found.'))
    ).toHaveLength(1);
    expect(readIssuer).not.toHaveBeenCalled();
  });

  test('the step of pull all (quiet) says nothing when there is nothing to export', async () => {
    expect(
      await configManagerExportTrustedJwtIssuers(undefined, undefined, true)
    ).toBe(true);

    expect(output()).toBe('');
  });
});

describe('the root realm', () => {
  test('of a Cloud tenant given as the realm is a message and a success without a name, a failure with one', async () => {
    expect(await configManagerExportTrustedJwtIssuers(undefined, '/')).toBe(
      true
    );
    expect(output()).toContain(
      'The root realm of an Identity Cloud tenant has no trusted JWT issuers.'
    );
    expect(await configManagerExportTrustedJwtIssuers('zion-issuer', '/')).toBe(
      false
    );
    expect(readIssuers).not.toHaveBeenCalled();
  });

  test.each(['forgeops', 'classic'])(
    'of %s is visited and its files go to the folder root',
    async (shape) => {
      deployment = shape;
      world.issuers['/'] = [issuerObject('zion-root')];

      expect(await configManagerExportTrustedJwtIssuers()).toBe(true);

      expect(exists(P('zion-root', '/'))).toBe(true);
      expect(exists('realms/root/realm-config/agents/TrustedJwtIssuer')).toBe(
        true
      );
    }
  );
});

describe('a failure', () => {
  test('to list the issuers of one realm is one failed operation named after the realm; the other realm is still pulled', async () => {
    world.listFails.add('bravo');
    world.issuers.alpha = [issuerObject('zion-issuer')];

    expect(await configManagerExportTrustedJwtIssuers()).toBe(false);

    expect(exists(P('zion-issuer'))).toBe(true);
    expect(output()).toContain('1 of 2 trusted JWT issuers failed');
    expect(output()).toContain('realm bravo');

    printed = [];
    expect(
      await configManagerExportTrustedJwtIssuers(
        undefined,
        undefined,
        false,
        true
      )
    ).toBe(true);
    expect(output()).toContain('The exit code stays 0');
  });

  test('to read one issuer is named realm/id in one summary; the others of the realm are still pulled', async () => {
    world.issuers.alpha = [
      issuerObject('zion-a'),
      issuerObject('zion-b'),
      issuerObject('zion-c'),
    ];
    world.readFails.set('alpha/zion-b', 'the server answered 500');

    expect(await configManagerExportTrustedJwtIssuers()).toBe(false);

    expect(exists(P('zion-a'))).toBe(true);
    expect(exists(P('zion-b'))).toBe(false);
    expect(exists(P('zion-c'))).toBe(true);
    expect(output()).toContain('1 of 3 trusted JWT issuers failed');
    expect(output()).toContain('alpha/zion-b: the server answered 500');
  });

  test('to write one file is a failed operation; the others are written', async () => {
    world.issuers.alpha = [issuerObject('zion-a'), issuerObject('zion-b')];
    fs.mkdirSync(path.join(tmp, P('zion-a')), { recursive: true });

    expect(await configManagerExportTrustedJwtIssuers()).toBe(false);

    expect(exists(P('zion-b'))).toBe(true);
    expect(output()).toContain('alpha/zion-a');
  });
});

describe('a named issuer', () => {
  test('is read by its name without listing, and written to a file of that name', async () => {
    world.issuers.alpha = [
      issuerObject('zion-issuer'),
      issuerObject('zion-other'),
    ];

    expect(
      await configManagerExportTrustedJwtIssuers('zion-issuer', 'alpha')
    ).toBe(true);

    expect(readIssuers).not.toHaveBeenCalled();
    expect(readIssuer).toHaveBeenCalledWith('zion-issuer');
    expect(exists(P('zion-issuer'))).toBe(true);
    expect(exists(P('zion-other'))).toBe(false);
  });

  test.each([false, true])(
    'that does not exist fails whatever --allow-failures says (%s)',
    async (allowFailures) => {
      expect(
        await configManagerExportTrustedJwtIssuers(
          'zion-missing',
          'alpha',
          false,
          allowFailures
        )
      ).toBe(false);

      expect(output()).toContain('alpha/zion-missing');
      expect(exists('realms')).toBe(false);
    }
  );

  test('needs a single realm: with two realms it is an error before any request', async () => {
    expect(await configManagerExportTrustedJwtIssuers('zion-issuer')).toBe(
      false
    );

    expect(output()).toContain(
      'Error: for a named trusted JWT issuer, specify a single realm'
    );
    expect(readIssuers).not.toHaveBeenCalled();
    expect(readIssuer).not.toHaveBeenCalled();
  });
});

describe('the names of the files', () => {
  test('are the ids made safe for a file system, and the real id stays inside the file', async () => {
    world.issuers.alpha = [issuerObject('Zion Issuer'), issuerObject('a:b')];

    expect(await configManagerExportTrustedJwtIssuers()).toBe(true);

    expect(exists(P('Zion Issuer'))).toBe(true);
    expect(read(P('a%3Ab'))._id).toBe('a:b');
  });

  test('that two ids share are a collision: the first id is pulled, the second is a named failure', async () => {
    world.issuers.alpha = [issuerObject('a%2Fb'), issuerObject('a/b')];

    expect(await configManagerExportTrustedJwtIssuers()).toBe(false);

    expect(output()).toContain('1 of 2 trusted JWT issuers failed');
    expect(output()).toContain("its file name collides with 'a/b'");
  });
});

describe('the overrides file', () => {
  const overridesFile = (content) => writeFile('oauth-issuers.json', content);

  test('is merged into the issuer of its entry, in the wrapped form of the file', async () => {
    world.issuers.alpha = [
      issuerObject('zion-issuer'),
      issuerObject('zion-other'),
    ];
    const file = overridesFile({
      alpha: [
        {
          id: 'zion-issuer',
          overrides: {
            issuer: { value: '${ZION_ISSUER_URL}' },
            jwksUri: { value: '${ZION_JWKS_URI}' },
          },
        },
      ],
    });

    expect(
      await configManagerExportTrustedJwtIssuers(
        undefined,
        undefined,
        false,
        false,
        file
      )
    ).toBe(true);

    const written = read(P('zion-issuer'));
    expect(written.issuer).toEqual({
      inherited: false,
      value: '${ZION_ISSUER_URL}',
    });
    expect(written.jwksUri).toEqual({
      inherited: false,
      value: '${ZION_JWKS_URI}',
    });
    expect(read(P('zion-other')).issuer.value).toBe(
      'https://zion-other.example.com'
    );
  });

  test('warns about an entry without an issuer, and the pull still succeeds', async () => {
    world.issuers.alpha = [issuerObject('zion-issuer')];
    const file = overridesFile({ alpha: [{ id: 'zion-gone', overrides: {} }] });

    expect(
      await configManagerExportTrustedJwtIssuers(
        undefined,
        undefined,
        false,
        false,
        file
      )
    ).toBe(true);

    expect(output()).toContain(
      "The overrides file names trusted JWT issuer 'zion-gone' in realm 'alpha', which does not exist; its overrides were not applied."
    );
  });

  test('is not resolved for placeholders', async () => {
    const file = overridesFile({ alpha: [] });

    await configManagerExportTrustedJwtIssuers(
      undefined,
      undefined,
      false,
      false,
      file
    );

    expect(readJsonFileCalls).toEqual([{ file, resolvePlaceholders: false }]);
  });

  test('that cannot be read fails the command before any request, whatever --allow-failures says', async () => {
    expect(
      await configManagerExportTrustedJwtIssuers(
        undefined,
        undefined,
        false,
        true,
        path.join(tmp, 'missing.json')
      )
    ).toBe(false);

    expect(readIssuers).not.toHaveBeenCalled();
  });
});

describe('private and secret key material in the key set', () => {
  const jwk = (members) =>
    JSON.stringify({ keys: [{ kty: 'RSA', ...members }] });

  test.each([
    ['a private key (d)', { d: 'private-part' }],
    [
      'a private key (p, q, dp, dq, qi)',
      { p: 'x', q: 'y', dp: 'a', dq: 'b', qi: 'c' },
    ],
    ['a symmetric key (k)', { kty: 'oct', k: 'symmetric-part' }],
  ])(
    '%s is a warning that names the issuer and never prints the key',
    async (_what, members) => {
      world.issuers.alpha = [
        issuerObject('zion-issuer', {
          jwkSet: { inherited: false, value: jwk(members) },
        }),
      ];

      expect(await configManagerExportTrustedJwtIssuers()).toBe(true);

      expect(output()).toContain(
        "WARN Trusted JWT issuer 'zion-issuer' of realm 'alpha' stores private or secret key material in jwkSet; the file contains it. Replace it with a placeholder in the overrides file."
      );
      for (const secret of ['private-part', 'symmetric-part']) {
        expect(output()).not.toContain(secret);
      }
      // the issuer is still written: the user asked for it
      expect(exists(P('zion-issuer'))).toBe(true);
    }
  );

  test('public members only are silent', async () => {
    world.issuers.alpha = [
      issuerObject('zion-issuer', {
        jwkSet: {
          inherited: false,
          value: jwk({ n: 'modulus', e: 'AQAB', kid: 'k1', use: 'sig' }),
        },
      }),
    ];

    expect(await configManagerExportTrustedJwtIssuers()).toBe(true);

    expect(output()).toBe('');
  });

  test('an unset or unparseable key set is silent', () => {
    expect(holdsSecretKeyMaterial(undefined)).toBe(false);
    expect(holdsSecretKeyMaterial({ inherited: false })).toBe(false);
    expect(
      holdsSecretKeyMaterial({ inherited: false, value: 'not json' })
    ).toBe(false);
    expect(holdsSecretKeyMaterial({ inherited: false, value: '"text"' })).toBe(
      false
    );
  });

  test('is found in a plain value and in a single JWK that is not a set', () => {
    expect(holdsSecretKeyMaterial(JSON.stringify({ kty: 'oct', k: 'x' }))).toBe(
      true
    );
    expect(holdsSecretKeyMaterial({ keys: [{ kty: 'RSA', d: 'x' }] })).toBe(
      true
    );
  });
});

describe('the no-movement guarantee: the file is what pull oauth2-agents writes', () => {
  const fixture = JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        'test/e2e/exports/fr-config-manager/forgeops/realms/alpha/realm-config/agents/TrustedJwtIssuer/testJWT.json'
      ),
      'utf8'
    )
  );

  test('both commands write the same bytes to the same path for the committed fixture issuer', async () => {
    const answer = { ...fixture, _rev: '-77' };
    world.issuers.alpha = [answer];

    // the generic route, which reads by type and id
    const configFile = writeFile('config/oauth2-agents.json', {
      alpha: { TrustedJwtIssuer: [{ id: 'testJWT' }] },
    });
    expect(await configManagerExportOAuth2Agents(configFile)).toBe(true);
    const generic = readRaw(P('testJWT'));
    fs.rmSync(path.join(tmp, 'realms'), { recursive: true });

    // the dedicated kind
    expect(await configManagerExportTrustedJwtIssuers(undefined, 'alpha')).toBe(
      true
    );

    expect(readRaw(P('testJWT'))).toBe(generic);
    // and both are the committed file, apart from the formatting of the writer
    expect(JSON.parse(generic)).toEqual(fixture);
  });
});
