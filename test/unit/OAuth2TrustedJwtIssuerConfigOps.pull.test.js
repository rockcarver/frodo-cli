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

const { configManagerExportTrustedJwtIssuers, trustedJwtIssuerFilePath } =
  await import(src('ops/OAuth2TrustedJwtIssuerConfigOps.ts'));
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
  test('lists the issuers of each realm once, reads each one, and writes the single read in the plain shape without _rev and with ${ escaped', async () => {
    world.issuers.alpha = [
      issuerObject('zion-issuer', {
        jwksUri: { inherited: false, value: 'https://${HOST}/jwks' },
      }),
      issuerObject('zion-other'),
    ];

    expect(await configManagerExportTrustedJwtIssuers()).toBe(true);

    const written = read(P('zion-issuer'));
    // the plain shape (record 0054): a property that is set is its value, one that is not set is not there
    expect(written.issuer).toBe('https://zion-issuer.example.com');
    expect(written.allowedSubjects).toEqual([]);
    expect(read(P('zion-other'))).not.toHaveProperty('jwksUri');
    expect(readRaw(P('zion-other'))).not.toContain('inherited');
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

  test.each([
    ['plain', (value) => value],
    [
      '{ value } (the help of the first 5.0.0 prereleases)',
      (value) => ({ value }),
    ],
    ['{ inherited: false, value }', (value) => ({ inherited: false, value })],
  ])(
    'is merged into the issuer of its entry, in the plain shape of the file, whether an override is written as %s',
    async (_form, as) => {
      world.issuers.alpha = [
        issuerObject('zion-issuer'),
        issuerObject('zion-other'),
      ];
      const file = overridesFile({
        alpha: [
          {
            id: 'zion-issuer',
            overrides: {
              issuer: as('${ZION_ISSUER_URL}'),
              jwksUri: as('${ZION_JWKS_URI}'),
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
      expect(written.issuer).toBe('${ZION_ISSUER_URL}');
      // the property was not set on the issuer: the override sets it, as a plain value
      expect(written.jwksUri).toBe('${ZION_JWKS_URI}');
      expect(readRaw(P('zion-issuer'))).not.toContain('inherited');
      expect(read(P('zion-other')).issuer).toBe(
        'https://zion-other.example.com'
      );
    }
  );

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

describe('private and secret key material in the key set (record 0055)', () => {
  const jwk = (members) =>
    JSON.stringify({ keys: [{ kty: 'RSA', ...members }] });
  const VARIABLE = '${ZION_ISSUER_JWKSET}';
  const withKeySet = (value) => [
    issuerObject('zion-issuer', { jwkSet: { inherited: false, value } }),
  ];

  test.each([
    ['a private key (d)', { d: 'private-part' }],
    [
      'a private key (p, q, dp, dq, qi)',
      { p: 'private-part', q: 'y', dp: 'a', dq: 'b', qi: 'c' },
    ],
    ['a multi-prime key (oth)', { oth: [{ r: 'private-part' }] }],
    ['a symmetric key (k)', { kty: 'oct', k: 'private-part' }],
  ])(
    '%s is not written: the file has the placeholder, the warning names issuer, property and variable, and the key is nowhere',
    async (_what, members) => {
      world.issuers.alpha = withKeySet(jwk(members));

      expect(await configManagerExportTrustedJwtIssuers()).toBe(true);

      expect(output()).toContain(
        "WARN Trusted JWT issuer 'zion-issuer' of realm 'alpha' holds private or secret key material in jwkSet: it is not written. The file has ${ZION_ISSUER_JWKSET} in its place; set that variable to the key set when you push."
      );
      expect(output()).not.toContain('private-part');
      // the placeholder is not escaped: a push fills it
      expect(readRaw(P('zion-issuer'))).toContain(`"jwkSet": "${VARIABLE}"`);
      expect(readRaw(P('zion-issuer'))).not.toContain('private-part');
      expect(readRaw(P('zion-issuer'))).not.toContain('\\\\${ZION');
      // the rest of the issuer is written as it was
      expect(read(P('zion-issuer')).issuer).toBe(
        'https://zion-issuer.example.com'
      );
    }
  );

  test('a set with one private key among public ones is replaced as a whole', async () => {
    world.issuers.alpha = withKeySet(
      JSON.stringify({
        keys: [
          { kty: 'RSA', kid: 'public-one', n: 'modulus', e: 'AQAB' },
          { kty: 'oct', k: 'private-part' },
        ],
      })
    );

    expect(await configManagerExportTrustedJwtIssuers()).toBe(true);

    expect(read(P('zion-issuer')).jwkSet).toBe(VARIABLE);
    expect(readRaw(P('zion-issuer'))).not.toContain('public-one');
  });

  test('public members only: nothing is said and the key set is written as it is', async () => {
    const value = jwk({ n: 'modulus', e: 'AQAB', kid: 'k1', use: 'sig' });
    world.issuers.alpha = withKeySet(value);

    expect(await configManagerExportTrustedJwtIssuers()).toBe(true);

    expect(output()).toBe('');
    expect(read(P('zion-issuer')).jwkSet).toBe(value);
  });

  test('an unset key set is not in the file and is silent', async () => {
    world.issuers.alpha = [issuerObject('zion-issuer')];

    expect(await configManagerExportTrustedJwtIssuers()).toBe(true);

    expect(output()).toBe('');
    expect(read(P('zion-issuer'))).not.toHaveProperty('jwkSet');
  });

  test('a variable of the overrides file replaces the key set before it is looked at: nothing to say', async () => {
    world.issuers.alpha = withKeySet(jwk({ d: 'private-part' }));
    const overrides = writeFile('overrides.json', {
      alpha: [
        { id: 'zion-issuer', overrides: { jwkSet: '${MY_OWN_VARIABLE}' } },
      ],
    });

    expect(
      await configManagerExportTrustedJwtIssuers(
        undefined,
        undefined,
        false,
        false,
        overrides
      )
    ).toBe(true);

    expect(output()).toBe('');
    expect(read(P('zion-issuer')).jwkSet).toBe('${MY_OWN_VARIABLE}');
    expect(readRaw(P('zion-issuer'))).not.toContain('private-part');
  });

  test('a private key in the overrides file is replaced as well: the key is never written, whatever the source', async () => {
    world.issuers.alpha = withKeySet(jwk({ n: 'x' }));
    const overrides = writeFile('overrides.json', {
      alpha: [
        {
          id: 'zion-issuer',
          overrides: { jwkSet: jwk({ d: 'private-part' }) },
        },
      ],
    });

    expect(
      await configManagerExportTrustedJwtIssuers(
        undefined,
        undefined,
        false,
        false,
        overrides
      )
    ).toBe(true);

    expect(read(P('zion-issuer')).jwkSet).toBe(VARIABLE);
    expect(readRaw(P('zion-issuer'))).not.toContain('private-part');
    expect(output()).not.toContain('private-part');
  });

  test('a second pull writes the same file: the pull is stable', async () => {
    world.issuers.alpha = withKeySet(jwk({ d: 'private-part' }));
    await configManagerExportTrustedJwtIssuers();
    const first = readRaw(P('zion-issuer'));

    await configManagerExportTrustedJwtIssuers();

    expect(readRaw(P('zion-issuer'))).toBe(first);
  });

  test('is silent about an issuer without private material and names only the one that has it', async () => {
    world.issuers.alpha = [
      issuerObject('zion-issuer', {
        jwkSet: { inherited: false, value: jwk({ d: 'private-part' }) },
      }),
      issuerObject('zion-other', {
        jwkSet: { inherited: false, value: jwk({ n: 'x', e: 'AQAB' }) },
      }),
    ];

    expect(await configManagerExportTrustedJwtIssuers()).toBe(true);

    expect(printed.filter((line) => line.startsWith('WARN'))).toHaveLength(1);
    expect(output()).toContain("'zion-issuer'");
    expect(output()).not.toContain("'zion-other'");
  });
});

describe('the no-movement guarantee: the file is at the path where pull oauth2-agents wrote it before it left issuers to this kind (frodo-cli#1259), in the plain shape of record 0054', () => {
  const fixture = JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        'test/e2e/exports/fr-config-manager/forgeops/realms/alpha/realm-config/agents/TrustedJwtIssuer/testJWT.json'
      ),
      'utf8'
    )
  );

  test('the dedicated kind writes the committed fixture issuer to the same path, and the generic route no longer writes it', async () => {
    const answer = { ...fixture, _rev: '-77' };
    world.issuers.alpha = [answer];

    // the generic route skips the type: nothing is read, nothing is written
    const configFile = writeFile('config/oauth2-agents.json', {
      alpha: { TrustedJwtIssuer: [{ id: 'testJWT' }] },
    });
    expect(await configManagerExportOAuth2Agents(configFile)).toBe(true);
    expect(fs.existsSync(path.join(tmp, P('testJWT')))).toBe(false);

    // the dedicated kind writes the file where the generic route used to write it
    expect(await configManagerExportTrustedJwtIssuers(undefined, 'alpha')).toBe(
      true
    );

    // the committed file is the single read of the issuer in the wrapped shape (an input of the
    // push, which accepts both shapes); the file the pull writes is the same issuer in the plain
    // shape: what is set on it as its value, nothing for the two properties that are not set
    expect(JSON.parse(readRaw(P('testJWT')))).toEqual({
      _id: 'testJWT',
      _type: {
        _id: 'TrustedJwtIssuer',
        collection: true,
        name: 'OAuth2 Trusted JWT Issuer',
      },
      allowedSubjects: [],
      consentedScopesClaim: 'scope',
      issuer: 'test',
      jwkStoreCacheMissCacheTime: 60000,
      jwksCacheTimeout: 3600000,
      resourceOwnerIdentityClaim: 'sub',
    });
  });
});
