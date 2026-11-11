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
 * `frodo config-manager pull cimd-profiles` (frodo-cli#1247): one file per CIMD
 * profile at `realms/<realm>/realm-config/agents/CIMDProfile/<id>.json`, in the
 * plain shape of the library's list read, without `_rev`, with `${` escaped.
 *
 * The rules (decision records 0040 and 0041): every profile is one operation of a
 * run that goes on after a failure; a realm or a deployment that does not offer
 * the type is a non-event (success, no read of profiles); what the command line
 * names (a profile, a single realm for it, the overrides file) must work whatever
 * `--allow-failures` says.
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

const isAvailable = jest.fn();
const readCIMDProfiles = jest.fn();

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
    oauth2oidc: {
      cimd: {
        isCIMDProfileAvailable: isAvailable,
        readCIMDProfiles,
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
}));

const { configManagerExportCIMDProfiles, cimdProfileFilePath } = await import(
  src('ops/CIMDProfileConfigOps.ts')
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

/** A profile as the list read returns it: plain values, with `_rev` and `_type`. */
const profile = (id, extra = {}) => ({
  _id: id,
  _rev: '-1234',
  _type: { _id: 'CIMDProfile', name: 'CIMD Profile', collection: true },
  cimdConfig: {
    cimdClientIdUrlPatterns: ['https://agents.example.com/*'],
    cimdSsrfProtectionEnabled: true,
  },
  coreOAuth2ClientConfig: { redirectionUris: [] },
  ...extra,
});

const P = (id, realm = 'alpha') => cimdProfileFilePath(realm, id);
// the name of a file for an id that has a character outside the basic multilingual plane
const safeName = (id) => id;

beforeEach(() => {
  deployment = 'cloud';
  currentRealm = undefined;
  printed = [];
  readJsonFileCalls = [];
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-cimd-pull-'));
  world = {
    realms: ['/', 'alpha', 'bravo'],
    // the realms that offer the type; a realm outside the set answers false
    offers: new Set(['/', 'alpha', 'bravo']),
    profiles: {},
    listFails: new Set(),
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
    return structuredClone(world.profiles[currentRealm] ?? []).sort((a, b) =>
      a._id.localeCompare(b._id)
    );
  });
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('the file of a CIMD profile', () => {
  test('is at realms/<realm>/realm-config/agents/CIMDProfile/<id>.json', () => {
    expect(P('zion-agents')).toBe(
      'realms/alpha/realm-config/agents/CIMDProfile/zion-agents.json'
    );
    expect(P('zion-agents', '/')).toBe(
      'realms/root/realm-config/agents/CIMDProfile/zion-agents.json'
    );
  });
});

describe('Cloud: realms alpha and bravo', () => {
  test('writes one file per profile, the object as listed without _rev and with ${ escaped, and nothing for a realm without profiles', async () => {
    world.profiles.alpha = [
      profile('zion-agents', {
        advancedOAuth2ClientConfig: { clientUri: 'https://${HOST}/' },
      }),
      profile('zion-tools'),
    ];

    const outcome = await configManagerExportCIMDProfiles();

    expect(outcome).toBe(true);
    const written = read(P('zion-agents'));
    const { _rev, ...listed } = profile('zion-agents', {
      advancedOAuth2ClientConfig: { clientUri: 'https://\\${HOST}/' },
    });
    expect(written).toEqual(listed);
    expect(written).not.toHaveProperty('_rev');
    expect(readRaw(P('zion-agents'))).toContain('https://\\\\${HOST}/');
    expect(exists(P('zion-tools'))).toBe(true);
    expect(exists('realms/bravo')).toBe(false);
    // the root realm of a Cloud tenant is not visited: nothing is requested for it
    expect(isAvailable).toHaveBeenCalledTimes(2);
    expect(readCIMDProfiles).toHaveBeenCalledTimes(2);
    expect(output()).not.toContain('No CIMD profiles found.');
  });

  test('says "No CIMD profiles found." once per run, not once per realm', async () => {
    const outcome = await configManagerExportCIMDProfiles();

    expect(outcome).toBe(true);
    expect(
      printed.filter((line) => line.includes('No CIMD profiles found.'))
    ).toHaveLength(1);
  });

  test('a sparse stored profile is written exactly as listed: nothing is added and nothing is padded with null', async () => {
    const sparse = {
      _id: 'zion-sparse',
      _rev: '-1',
      cimdConfig: { cimdClientIdUrlPatterns: ['https://agents.example.com/*'] },
      coreOAuth2ClientConfig: {},
    };
    world.profiles.alpha = [sparse];

    expect(await configManagerExportCIMDProfiles()).toBe(true);

    const { _rev, ...expected } = sparse;
    expect(read(P('zion-sparse'))).toEqual(expected);
  });

  test('adds nothing and masks nothing: a member that looks like a secret is written as listed (the library does not list one)', async () => {
    world.profiles.alpha = [profile('zion-agents', { userpassword: 'x' })];

    expect(await configManagerExportCIMDProfiles()).toBe(true);

    expect(Object.keys(read(P('zion-agents'))).sort()).toEqual(
      [
        '_id',
        '_type',
        'cimdConfig',
        'coreOAuth2ClientConfig',
        'userpassword',
      ].sort()
    );
  });
});

describe('the root realm', () => {
  test('of a Cloud tenant given as the realm is a message and a success without a name, and nothing is requested', async () => {
    expect(await configManagerExportCIMDProfiles(undefined, '/')).toBe(true);

    expect(output()).toContain(
      'The root realm of an Identity Cloud tenant has no CIMD profiles.'
    );
    expect(isAvailable).not.toHaveBeenCalled();
    expect(readCIMDProfiles).not.toHaveBeenCalled();
  });

  test('of a Cloud tenant given as the realm with a name is a failure, not the single-realm error', async () => {
    expect(await configManagerExportCIMDProfiles('zion-agents', '/')).toBe(
      false
    );

    expect(output()).toContain(
      'The root realm of an Identity Cloud tenant has no CIMD profiles.'
    );
    expect(output()).not.toContain('specify a single realm');
    expect(readCIMDProfiles).not.toHaveBeenCalled();
  });

  test('of a Cloud tenant given as the realm in the step of pull all (quiet) says nothing', async () => {
    expect(await configManagerExportCIMDProfiles(undefined, '/', true)).toBe(
      true
    );
    expect(output()).toBe('');
  });

  test.each(['forgeops', 'classic'])(
    'of %s is visited and its files go to the folder root',
    async (shape) => {
      deployment = shape;
      world.profiles['/'] = [profile('zion-agents')];
      world.profiles.alpha = [profile('zion-tools')];

      expect(await configManagerExportCIMDProfiles()).toBe(true);

      expect(exists(P('zion-agents', '/'))).toBe(true);
      expect(exists('realms/root/realm-config/agents/CIMDProfile')).toBe(true);
      expect(exists(P('zion-tools'))).toBe(true);
      expect(currentRealm).toBe('bravo');
    }
  );
});

describe('a realm or a deployment that does not offer the type', () => {
  test('is success without a read of profiles; the step of pull all (quiet) prints nothing', async () => {
    world.offers = new Set();

    expect(
      await configManagerExportCIMDProfiles(undefined, undefined, true)
    ).toBe(true);

    expect(readCIMDProfiles).not.toHaveBeenCalled();
    expect(output()).toBe('');
  });

  test('is success, and the command says so once per realm', async () => {
    world.offers = new Set();

    expect(await configManagerExportCIMDProfiles()).toBe(true);

    expect(readCIMDProfiles).not.toHaveBeenCalled();
    expect(output()).toContain(
      "CIMD profiles are not available in realm 'alpha' of this deployment."
    );
    expect(output()).toContain(
      "CIMD profiles are not available in realm 'bravo' of this deployment."
    );
    expect(output()).not.toContain('failed');
    expect(output()).not.toContain('No CIMD profiles found.');
  });

  test('one realm without the type does not stop the realm that has it', async () => {
    world.offers = new Set(['bravo']);
    world.profiles.bravo = [profile('zion-agents')];

    expect(await configManagerExportCIMDProfiles()).toBe(true);

    expect(exists(P('zion-agents', 'bravo'))).toBe(true);
  });

  test.each([false, true])(
    'with a name it fails whatever --allow-failures says (%s), and names the profile and the realm',
    async (allowFailures) => {
      world.offers = new Set();

      expect(
        await configManagerExportCIMDProfiles(
          'zion-agents',
          'alpha',
          false,
          allowFailures
        )
      ).toBe(false);

      expect(output()).toContain(
        "CIMD profiles are not available in realm 'alpha' of this deployment, so 'zion-agents' cannot be pulled."
      );
      expect(readCIMDProfiles).not.toHaveBeenCalled();
    }
  );
});

describe('a failure', () => {
  test('to list the profiles of one realm is one failed operation named after the realm; the other realm is still pulled; --allow-failures keeps the exit code at 0', async () => {
    world.listFails.add('bravo');
    world.profiles.alpha = [profile('zion-agents')];

    expect(await configManagerExportCIMDProfiles()).toBe(false);

    expect(exists(P('zion-agents'))).toBe(true);
    expect(output()).toContain('1 of 2 CIMD profiles failed');
    expect(output()).toContain('realm bravo');

    printed = [];
    expect(
      await configManagerExportCIMDProfiles(undefined, undefined, false, true)
    ).toBe(true);
    expect(output()).toContain('realm bravo');
    expect(output()).toContain('The exit code stays 0');
  });

  test('to write one file is a failed operation named realm/id; the other profiles are written; --allow-failures keeps the exit code at 0', async () => {
    world.profiles.alpha = [profile('zion-a'), profile('zion-b')];
    // a directory where the file would be: the write fails
    fs.mkdirSync(path.join(tmp, P('zion-a')), { recursive: true });

    expect(await configManagerExportCIMDProfiles()).toBe(false);

    expect(exists(P('zion-b'))).toBe(true);
    expect(output()).toContain('1 of 2 CIMD profiles failed');
    expect(output()).toContain('alpha/zion-a');

    printed = [];
    expect(
      await configManagerExportCIMDProfiles(undefined, undefined, false, true)
    ).toBe(true);
    expect(output()).toContain('alpha/zion-a');
  });
});

describe('a named profile', () => {
  test('is found ignoring case and the file is named after the STORED id', async () => {
    world.profiles.alpha = [profile('zion-agents'), profile('zion-tools')];

    expect(await configManagerExportCIMDProfiles('Zion-Agents', 'alpha')).toBe(
      true
    );

    expect(exists(P('zion-agents'))).toBe(true);
    // (compared by listing the folder: a file system may ignore case)
    expect(fs.readdirSync(path.join(tmp, path.dirname(P('x'))))).toEqual([
      'zion-agents.json',
    ]);
    expect(exists(P('zion-tools'))).toBe(false);
    expect(read(P('zion-agents'))._id).toBe('zion-agents');
  });

  test('gives the same bytes as the pull without a name (the shape of the list read in both)', async () => {
    world.profiles.alpha = [profile('zion-agents')];

    await configManagerExportCIMDProfiles(undefined, 'alpha');
    const all = readRaw(P('zion-agents'));
    fs.rmSync(path.join(tmp, 'realms'), { recursive: true });
    await configManagerExportCIMDProfiles('zion-agents', 'alpha');

    expect(readRaw(P('zion-agents'))).toBe(all);
  });

  test('with a character outside the basic multilingual plane is found, because the profile is picked from the list', async () => {
    const id = 'zion-\u{1F916}';
    world.profiles.alpha = [profile(id)];

    expect(await configManagerExportCIMDProfiles(id, 'alpha')).toBe(true);

    expect(read(P(safeName(id)))._id).toBe(id);
  });

  test.each([false, true])(
    'that does not exist fails in plain words whatever --allow-failures says (%s)',
    async (allowFailures) => {
      world.profiles.alpha = [profile('zion-agents')];

      expect(
        await configManagerExportCIMDProfiles(
          'zion-missing',
          'alpha',
          false,
          allowFailures
        )
      ).toBe(false);

      expect(output()).toContain(
        "CIMD profile 'zion-missing' not found in realm 'alpha'."
      );
      expect(exists(P('zion-agents'))).toBe(false);
    }
  );

  test('needs a single realm: with two realms it is an error before any request', async () => {
    expect(await configManagerExportCIMDProfiles('zion-agents')).toBe(false);

    expect(output()).toContain(
      'Error: for a named CIMD profile, specify a single realm'
    );
    expect(isAvailable).not.toHaveBeenCalled();
    expect(readCIMDProfiles).not.toHaveBeenCalled();
  });

  test('is a failure when the list of its realm cannot be read, whatever --allow-failures says', async () => {
    world.listFails.add('alpha');

    expect(
      await configManagerExportCIMDProfiles('zion-agents', 'alpha', false, true)
    ).toBe(false);
  });
});

describe('the names of the files', () => {
  test('are the ids made safe for a file system, and the real id stays inside the file', async () => {
    world.profiles.alpha = [profile('Zion Agents'), profile('a:b')];

    expect(await configManagerExportCIMDProfiles()).toBe(true);

    expect(exists(P('Zion Agents'))).toBe(true);
    expect(exists(P('a%3Ab'))).toBe(true);
    expect(read(P('a%3Ab'))._id).toBe('a:b');
  });

  test('that two ids share are a collision: the first id is pulled, the second is a named failure', async () => {
    // the id 'a/b' is written as 'a%2Fb', which is also the id 'a%2Fb'; the profiles are
    // handled in the order of their ids, so 'a/b' is first
    world.profiles.alpha = [profile('a%2Fb'), profile('a/b')];

    expect(await configManagerExportCIMDProfiles()).toBe(false);

    expect(output()).toContain('1 of 2 CIMD profiles failed');
    expect(output()).toContain("its file name collides with 'a/b'");
    expect(read(P('a%2Fb'))._id).toBe('a/b');
  });

  test('that are too long for a file name are cut so that the file can be written, and two that are cut to the same name are a collision', async () => {
    const first = `${'x'.repeat(300)}-1`;
    const second = `${'x'.repeat(300)}-2`;
    world.profiles.alpha = [profile(first), profile(second)];

    expect(await configManagerExportCIMDProfiles()).toBe(false);

    expect(output()).toContain('1 of 2 CIMD profiles failed');
    const files = fs.readdirSync(path.join(tmp, path.dirname(P('x'))));
    expect(files).toHaveLength(1);
    // 255 bytes at most, the extension included
    expect(Buffer.byteLength(files[0])).toBeLessThanOrEqual(255);
    expect(
      JSON.parse(
        fs.readFileSync(path.join(tmp, path.dirname(P('x')), files[0]), 'utf8')
      )._id
    ).toBe(first);
  });

  test('that are cut in the middle of a character do not keep half of it', async () => {
    const id = '\u00e9'.repeat(200);
    world.profiles.alpha = [profile(id)];

    expect(await configManagerExportCIMDProfiles()).toBe(true);

    const [file] = fs.readdirSync(path.join(tmp, path.dirname(P('x'))));
    expect(file).not.toContain('\uFFFD');
    expect(Buffer.byteLength(file)).toBeLessThanOrEqual(255);
  });
});

describe('the overrides file', () => {
  const overridesFile = (content) => writeFile('cimd-profiles.json', content);

  test('is merged into the profile of its entry, the object keys by name', async () => {
    world.profiles.alpha = [profile('zion-agents'), profile('zion-tools')];
    const file = overridesFile({
      alpha: [
        {
          id: 'zion-agents',
          overrides: {
            cimdConfig: {
              cimdClientIdUrlPatterns: ['https://${ZION_AGENTS_URL_PATTERN}/*'],
            },
          },
        },
      ],
    });

    expect(
      await configManagerExportCIMDProfiles(
        undefined,
        undefined,
        false,
        false,
        file
      )
    ).toBe(true);

    expect(read(P('zion-agents')).cimdConfig).toEqual({
      cimdClientIdUrlPatterns: ['https://${ZION_AGENTS_URL_PATTERN}/*'],
      cimdSsrfProtectionEnabled: true,
    });
    // another profile is not touched
    expect(read(P('zion-tools')).cimdConfig.cimdClientIdUrlPatterns).toEqual([
      'https://agents.example.com/*',
    ]);
  });

  test('replaces an array element by element, as the other kinds do: one element changes only the first pattern', async () => {
    world.profiles.alpha = [
      profile('zion-agents', {
        cimdConfig: {
          cimdClientIdUrlPatterns: [
            'https://agents.example.com/*',
            'https://second.example.com/*',
          ],
        },
      }),
    ];
    const file = overridesFile({
      alpha: [
        {
          id: 'zion-agents',
          overrides: {
            cimdConfig: { cimdClientIdUrlPatterns: ['https://${HOST}/*'] },
          },
        },
      ],
    });

    await configManagerExportCIMDProfiles(
      undefined,
      undefined,
      false,
      false,
      file
    );

    expect(read(P('zion-agents')).cimdConfig.cimdClientIdUrlPatterns).toEqual([
      'https://${HOST}/*',
      'https://second.example.com/*',
    ]);
  });

  test('matches an id ignoring case', async () => {
    world.profiles.alpha = [profile('zion-agents')];
    const file = overridesFile({
      alpha: [
        {
          id: 'Zion-Agents',
          overrides: { cimdConfig: { cimdSsrfProtectionEnabled: false } },
        },
      ],
    });

    await configManagerExportCIMDProfiles(
      undefined,
      undefined,
      false,
      false,
      file
    );

    expect(read(P('zion-agents')).cimdConfig.cimdSsrfProtectionEnabled).toBe(
      false
    );
    expect(output()).not.toContain('does not exist');
  });

  test('warns about an entry without a profile and about nothing else, and the pull still succeeds', async () => {
    world.profiles.alpha = [profile('zion-agents')];
    const file = overridesFile({
      alpha: [{ id: 'zion-agents' }, { id: 'zion-gone', overrides: {} }],
      other: [{ id: 'zion-other' }],
    });

    expect(
      await configManagerExportCIMDProfiles(
        undefined,
        undefined,
        false,
        false,
        file
      )
    ).toBe(true);

    expect(output()).toContain(
      "The overrides file names CIMD profile 'zion-gone' in realm 'alpha', which does not exist; its overrides were not applied."
    );
    // a realm that was not visited is not reported
    expect(output()).not.toContain('zion-other');
    expect(output()).not.toContain("'zion-agents' in realm");
  });

  test('is not resolved for placeholders: its values are written into the files as they are', async () => {
    const file = overridesFile({ alpha: [] });

    await configManagerExportCIMDProfiles(
      undefined,
      undefined,
      false,
      false,
      file
    );

    expect(readJsonFileCalls).toEqual([{ file, resolvePlaceholders: false }]);
  });

  test.each([
    ['is not there', () => path.join(tmp, 'missing.json')],
    [
      'is not JSON',
      () => {
        const target = path.join(tmp, 'cimd-profiles.json');
        fs.writeFileSync(target, '{ not json');
        return target;
      },
    ],
    ['is not an object', () => overridesFile([])],
    ['has no list for a realm', () => overridesFile({ alpha: {} })],
    ['has an entry without an id', () => overridesFile({ alpha: [{}] })],
    [
      'has overrides that are not an object',
      () => overridesFile({ alpha: [{ id: 'a', overrides: [] }] }),
    ],
  ])(
    'that %s fails the command before any request, whatever --allow-failures says',
    async (_what, make) => {
      const file = make();

      expect(
        await configManagerExportCIMDProfiles(
          undefined,
          undefined,
          false,
          true,
          file
        )
      ).toBe(false);

      expect(isAvailable).not.toHaveBeenCalled();
      expect(readCIMDProfiles).not.toHaveBeenCalled();
      expect(exists('realms')).toBe(false);
    }
  );
});
