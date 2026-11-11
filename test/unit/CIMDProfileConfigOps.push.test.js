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
 * `frodo config-manager push cimd-profiles` (frodo-cli#1248): the files that
 * `pull cimd-profiles` wrote (`realms/<realm>/realm-config/agents/CIMDProfile/<name>.json`)
 * are imported into the matching realms, every file one operation of a run that
 * goes on after a failure (decision record 0040), `${NAME}` filled from the
 * environment. A tree for a deployment that offers the type pushed to one that does
 * not is skipped and counted, not failed; what the command line names must work
 * whatever `--allow-failures` says (record 0041).
 *
 * The library is a fake that records what it is asked to import; the working
 * directory is a real temporary tree; nothing here contacts a tenant. The library's
 * own work (the id check, the type guard, the second write that makes a created
 * profile equal to its file) is the library's and has its tests there: here it is
 * stubbed with the answers it gives.
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
let environment;
let imports;

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

/** The library's `readJsonFile`: placeholders are resolved from the environment, an escaped one stays literal. */
function readJsonFile(file, resolvePlaceholders = true) {
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new FrodoError(`Error reading file ${file}`, error);
  }
  if (resolvePlaceholders) {
    const placeholders = content.match(/\\*?\${.*?}/g) ?? [];
    for (const placeholder of placeholders.filter(
      (p) => !p.startsWith('\\\\')
    )) {
      const name = placeholder.replace(/\${(.*)}/, '$1');
      if (environment[name] === undefined) {
        throw new FrodoError(`No value found for placeholder "${name}"`);
      }
      content = content.replaceAll(placeholder, environment[name]);
    }
    content = content.replace(/\\\\\${/g, '${');
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new FrodoError(`Error parsing JSON from ${file}`, error);
  }
}

const isAvailable = jest.fn();
const readCIMDProfiles = jest.fn();
const importCIMDProfiles = jest.fn();

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
      saveJsonToFile: (data, filename, includeMeta, keepRev) => {
        const copy = structuredClone(data);
        if (!keepRev) delete copy._rev;
        fs.writeFileSync(filename, JSON.stringify(copy, null, 2));
      },
      readJsonFile,
      escapePlaceholders,
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
        importCIMDProfiles,
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

const {
  configManagerExportCIMDProfiles,
  configManagerImportCIMDProfiles,
  cimdProfileFilePath,
} = await import(src('ops/CIMDProfileConfigOps.ts'));

const output = () => printed.join('\n');
const write = (relative, content) => {
  const target = path.join(tmp, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  );
};

/** A profile as a file of a pull holds it: plain values, with `_id` and `_type`. */
const profile = (id, extra = {}) => ({
  _id: id,
  _type: { _id: 'CIMDProfile', name: 'CIMD Profile', collection: true },
  cimdConfig: { cimdClientIdUrlPatterns: ['https://agents.example.com/*'] },
  ...extra,
});

const P = (id, realm = 'alpha') => cimdProfileFilePath(realm, id);
const writeProfile = (id, realm = 'alpha', extra = {}) =>
  write(P(id, realm), profile(id, extra));
/** What was imported in a realm: the import data of its call. */
const importedIn = (realm) =>
  imports.filter((i) => i.realm === realm).map((i) => i.data.cimdProfile);

beforeEach(() => {
  deployment = 'cloud';
  currentRealm = undefined;
  printed = [];
  imports = [];
  environment = {};
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-cimd-push-'));
  world = {
    realms: ['/', 'alpha', 'bravo'],
    offers: new Set(['/', 'alpha', 'bravo']),
    profiles: {},
    importFails: new Map(),
    importThrows: new Set(),
  };
  isAvailable.mockReset().mockImplementation(async () => {
    return world.offers.has(currentRealm);
  });
  readCIMDProfiles.mockReset().mockImplementation(async () => {
    return structuredClone(world.profiles[currentRealm] ?? []);
  });
  importCIMDProfiles
    .mockReset()
    .mockImplementation(async (importData, callback) => {
      imports.push({ realm: currentRealm, data: structuredClone(importData) });
      if (world.importThrows.has(currentRealm)) {
        throw new FrodoError(
          `Error importing ${currentRealm} realm CIMD profiles`
        );
      }
      const results = [];
      for (const id of Object.keys(importData.cimdProfile)) {
        const message = world.importFails.get(id);
        if (message) {
          const error = new FrodoError(
            `Error importing ${currentRealm} realm CIMD profile ${id}`,
            new Error(message)
          );
          if (callback) callback(error, undefined);
          else throw error;
        } else {
          const result = {
            profile: importData.cimdProfile[id],
            created: true,
            repaired: false,
          };
          results.push(result);
          callback?.(undefined, result);
        }
      }
      return results;
    });
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('the files of the tree', () => {
  test('Cloud: the profiles of alpha and bravo reach the library in one call per realm, keyed by _id, without _id and _rev', async () => {
    writeProfile('zion-agents', 'alpha', { _rev: '-77' });
    writeProfile('zion-tools', 'alpha');
    writeProfile('zion-agents', 'bravo');

    expect(await configManagerImportCIMDProfiles()).toBe(true);

    expect(imports).toHaveLength(2);
    const alpha = importedIn('alpha')[0];
    expect(Object.keys(alpha).sort()).toEqual(['zion-agents', 'zion-tools']);
    for (const body of Object.values(alpha)) {
      expect(body).not.toHaveProperty('_id');
      expect(body).not.toHaveProperty('_rev');
      expect(body._type._id).toBe('CIMDProfile');
    }
    expect(Object.keys(importedIn('bravo')[0])).toEqual(['zion-agents']);
    expect(output()).toBe('');
  });

  test('a ${NAME} is filled from the environment and an escaped \\${NAME} stays literal', async () => {
    environment.ZION_AGENTS_URL_PATTERN = 'agents.zion.example.com';
    write(P('zion-agents'), {
      ...profile('zion-agents'),
      cimdConfig: {
        cimdClientIdUrlPatterns: ['https://${ZION_AGENTS_URL_PATTERN}/*'],
      },
      advancedOAuth2ClientConfig: { clientName: '\\${LITERAL}' },
    });

    expect(await configManagerImportCIMDProfiles()).toBe(true);

    const body = importedIn('alpha')[0]['zion-agents'];
    expect(body.cimdConfig.cimdClientIdUrlPatterns).toEqual([
      'https://agents.zion.example.com/*',
    ]);
    expect(body.advancedOAuth2ClientConfig.clientName).toBe('${LITERAL}');
  });

  test('plain and wrapped files are both handed on as they are: nothing is reshaped', async () => {
    write(P('zion-plain'), profile('zion-plain'));
    write(P('zion-wrapped'), {
      _id: 'zion-wrapped',
      cimdConfig: {
        cimdClientIdUrlPatterns: {
          inherited: false,
          value: ['https://agents.example.com/*'],
        },
      },
    });

    expect(await configManagerImportCIMDProfiles()).toBe(true);

    const imported = importedIn('alpha')[0];
    expect(imported['zion-plain'].cimdConfig.cimdClientIdUrlPatterns).toEqual([
      'https://agents.example.com/*',
    ]);
    expect(imported['zion-wrapped'].cimdConfig.cimdClientIdUrlPatterns).toEqual(
      {
        inherited: false,
        value: ['https://agents.example.com/*'],
      }
    );
  });

  test('a file without _id gets the file name as its id, decoded; a file whose _id differs from its name is pushed under the _id', async () => {
    write(P('a%3Ab'), {
      cimdConfig: { cimdClientIdUrlPatterns: ['https://a.example.com/*'] },
    });
    write(P('named-differently'), profile('zion-real-id'));

    expect(await configManagerImportCIMDProfiles()).toBe(true);

    expect(Object.keys(importedIn('alpha')[0]).sort()).toEqual([
      'a:b',
      'zion-real-id',
    ]);
  });

  test('a file name that is not valid percent-encoding is the id as it is', async () => {
    write(P('100%'), {
      cimdConfig: { cimdClientIdUrlPatterns: ['https://a.example.com/*'] },
    });

    expect(await configManagerImportCIMDProfiles()).toBe(true);

    expect(Object.keys(importedIn('alpha')[0])).toEqual(['100%']);
  });

  test('a file that a pull wrote is pushed back as it was pulled (round trip), ${ included', async () => {
    world.profiles.alpha = [
      {
        ...profile('zion-agents', { _rev: '-1' }),
        advancedOAuth2ClientConfig: { clientUri: 'https://${HOST}/' },
      },
    ];
    expect(await configManagerExportCIMDProfiles(undefined, 'alpha')).toBe(
      true
    );

    expect(await configManagerImportCIMDProfiles(undefined, 'alpha')).toBe(
      true
    );

    const { _id, _rev, ...expected } = world.profiles.alpha[0];
    expect(importedIn('alpha')[0]['zion-agents']).toEqual(expected);
  });

  test('a realm folder without CIMD profiles is nothing; a tree without any CIMD profile folder is an info line and a success', async () => {
    write('realms/alpha/realm-config/agents/OAuth2Client/zion-client.json', {});

    expect(await configManagerImportCIMDProfiles()).toBe(true);

    expect(importCIMDProfiles).not.toHaveBeenCalled();
    expect(output()).toContain("No CIMD profile files found in '");
  });

  test('a tree without a realms folder is an error: a mistyped -D must not look like success', async () => {
    expect(await configManagerImportCIMDProfiles()).toBe(false);

    expect(output()).toContain("There is no 'realms' folder in '");
    expect(importCIMDProfiles).not.toHaveBeenCalled();
  });

  test('files that are not .json are ignored', async () => {
    writeProfile('zion-agents');
    write(`${P('zion-agents').replace('.json', '')}.txt`, 'notes');

    expect(await configManagerImportCIMDProfiles()).toBe(true);

    expect(Object.keys(importedIn('alpha')[0])).toEqual(['zion-agents']);
  });
});

describe('the root realm', () => {
  test('of a Cloud tenant is skipped in the walk of the tree and nothing is requested for it', async () => {
    writeProfile('zion-agents', '/');
    writeProfile('zion-tools', 'alpha');

    expect(await configManagerImportCIMDProfiles()).toBe(true);

    expect(imports.map((i) => i.realm)).toEqual(['alpha']);
  });

  test('of a Cloud tenant given as the realm is a message and a success without a name, a failure with one', async () => {
    writeProfile('zion-agents', '/');

    expect(await configManagerImportCIMDProfiles(undefined, '/')).toBe(true);
    expect(output()).toContain(
      'The root realm of an Identity Cloud tenant has no CIMD profiles.'
    );
    expect(await configManagerImportCIMDProfiles('zion-agents', '/')).toBe(
      false
    );
    expect(importCIMDProfiles).not.toHaveBeenCalled();
  });

  test.each(['forgeops', 'classic'])(
    'of %s: the folder root is the realm / and is pushed',
    async (shape) => {
      deployment = shape;
      world.offers = new Set(['/']);
      writeProfile('zion-agents', '/');

      expect(await configManagerImportCIMDProfiles()).toBe(true);

      expect(imports.map((i) => i.realm)).toEqual(['/']);
    }
  );
});

describe('a realm or a deployment that does not offer the type', () => {
  test('is skipped with one warning that counts the files, and the other realms are pushed', async () => {
    world.offers = new Set(['bravo']);
    writeProfile('zion-agents', 'alpha');
    writeProfile('zion-tools', 'alpha');
    writeProfile('zion-agents', 'bravo');

    expect(await configManagerImportCIMDProfiles()).toBe(true);

    expect(imports.map((i) => i.realm)).toEqual(['bravo']);
    expect(output()).toContain(
      "Realm 'alpha' does not offer CIMD profiles on this deployment: 2 files in "
    );
    expect(output()).toContain('were not pushed.');
    expect(output()).not.toContain('failed');
  });

  test.each([false, true])(
    'with a name it fails whatever --allow-failures says (%s)',
    async (allowFailures) => {
      world.offers = new Set();
      writeProfile('zion-agents', 'alpha');

      expect(
        await configManagerImportCIMDProfiles(
          'zion-agents',
          'alpha',
          allowFailures
        )
      ).toBe(false);

      expect(output()).toContain(
        "CIMD profiles are not available in realm 'alpha' of this deployment, so 'zion-agents' cannot be pushed."
      );
      expect(importCIMDProfiles).not.toHaveBeenCalled();
    }
  );

  test('is not asked about when the realm has no file', async () => {
    world.offers = new Set();

    expect(await configManagerImportCIMDProfiles(undefined, 'alpha')).toBe(
      false
    );
    fs.mkdirSync(path.join(tmp, 'realms'));
    expect(await configManagerImportCIMDProfiles(undefined, 'alpha')).toBe(
      true
    );

    expect(isAvailable).not.toHaveBeenCalled();
  });
});

describe('failures', () => {
  test('a file with invalid JSON and a file with an unresolved placeholder are named in one summary, the third file is imported, --allow-failures keeps the exit code at 0', async () => {
    write(P('zion-broken'), '{ not json');
    write(P('zion-placeholder'), {
      ...profile('zion-placeholder'),
      cimdConfig: { cimdClientIdUrlPatterns: ['https://${NOT_SET}/*'] },
    });
    writeProfile('zion-fine');

    expect(await configManagerImportCIMDProfiles()).toBe(false);

    expect(Object.keys(importedIn('alpha')[0])).toEqual(['zion-fine']);
    expect(output()).toContain('2 of 3 CIMD profiles failed');
    expect(output()).toContain('alpha/zion-broken.json');
    expect(output()).toContain('alpha/zion-placeholder.json');
    expect(output()).toContain('No value found for placeholder "NOT_SET"');

    printed = [];
    imports = [];
    expect(
      await configManagerImportCIMDProfiles(undefined, undefined, true)
    ).toBe(true);
    expect(output()).toContain('2 of 3 CIMD profiles failed');
    expect(output()).toContain('The exit code stays 0');
  });

  test('a file that is not an object is a named failure', async () => {
    write(P('zion-list'), []);
    writeProfile('zion-fine');

    expect(await configManagerImportCIMDProfiles()).toBe(false);

    expect(output()).toContain('alpha/zion-list.json');
    expect(output()).toContain('is not a JSON object');
    expect(Object.keys(importedIn('alpha')[0])).toEqual(['zion-fine']);
  });

  test('the library reports one profile as failed: it is named with the reason of the server, the others are counted', async () => {
    writeProfile('zion-a');
    writeProfile('zion-b');
    writeProfile('zion-c');
    world.importFails.set(
      'zion-b',
      'Data validation failed for the attribute, Tree Name'
    );

    expect(await configManagerImportCIMDProfiles()).toBe(false);

    expect(output()).toContain('1 of 3 CIMD profiles failed');
    expect(output()).toContain(
      'alpha/zion-b: Data validation failed for the attribute, Tree Name'
    );
    expect(output()).not.toContain('alpha/zion-a:');
  });

  test('a profile that is named by position is named right when the keys are not in the order of the files', async () => {
    // integer-like keys come first in an object, whatever the insertion order
    writeProfile('b');
    writeProfile('10');
    writeProfile('2');
    world.importFails.set('2', 'refused');

    expect(await configManagerImportCIMDProfiles()).toBe(false);

    expect(output()).toContain('1 of 3 CIMD profiles failed');
    expect(output()).toContain('alpha/2: refused');
    expect(output()).not.toContain('alpha/10:');
  });

  test('a profile that was created but could not be restored to the file says so', async () => {
    writeProfile('zion-a');
    importCIMDProfiles.mockImplementation(async (importData, callback) => {
      callback(
        new FrodoError(
          'Error importing alpha realm CIMD profile zion-a: created, but not restored to the exported state',
          new Error('the second write was refused')
        ),
        undefined
      );
      return [];
    });

    expect(await configManagerImportCIMDProfiles()).toBe(false);

    expect(output()).toContain(
      "alpha/zion-a: created, but not restored to the file's state: the second write was refused"
    );
  });

  test('a whole call that fails is one failed operation named after the realm, and the next realm still runs', async () => {
    writeProfile('zion-agents', 'alpha');
    writeProfile('zion-tools', 'bravo');
    world.importThrows.add('alpha');

    expect(await configManagerImportCIMDProfiles()).toBe(false);

    expect(imports.map((i) => i.realm)).toEqual(['alpha', 'bravo']);
    expect(output()).toContain('1 of 2 CIMD profiles failed');
    expect(output()).toContain('realm alpha');
  });

  test('two files for one id are a named failure for the second, ignoring case; the first is pushed', async () => {
    // (two names that differ only in case cannot be told apart on every file system, so the ids differ, not the names)
    write(P('zion-1'), profile('Zion'));
    write(P('zion-2'), profile('zion'));

    expect(await configManagerImportCIMDProfiles()).toBe(false);

    expect(Object.keys(importedIn('alpha')[0])).toEqual(['Zion']);
    expect(output()).toContain(
      "two files for CIMD profile 'zion' in realm 'alpha': zion-2.json is ignored"
    );
    expect(output()).toContain('1 of 2 CIMD profiles failed');
  });

  test('a file whose _id repeats the id of a file with another name is the duplicate', async () => {
    write(P('a-file'), profile('same'));
    write(P('b-file'), profile('SAME'));

    expect(await configManagerImportCIMDProfiles()).toBe(false);

    expect(Object.keys(importedIn('alpha')[0])).toEqual(['same']);
    expect(output()).toContain('b-file.json is ignored');
  });
});

describe('warnings that change no exit code', () => {
  test.each(['Zion Agents', 'zion[1]', 'zion|agents'])(
    'an id with a space, a bracket or a pipe character (%s) is pushed with a warning',
    async (id) => {
      writeProfile(id);

      expect(await configManagerImportCIMDProfiles()).toBe(true);

      expect(output()).toContain(`WARN CIMD profile '${id}'`);
      expect(output()).toContain('the console may not manage the profile');
      expect(Object.keys(importedIn('alpha')[0])).toEqual([id]);
    }
  );

  test('an ordinary id is pushed without a warning', async () => {
    writeProfile('zion-agents.v1_2');

    await configManagerImportCIMDProfiles();

    expect(output()).toBe('');
  });
});

describe('a named profile', () => {
  test('pushes the file of that name only', async () => {
    writeProfile('zion-agents');
    writeProfile('zion-tools');

    expect(await configManagerImportCIMDProfiles('zion-agents', 'alpha')).toBe(
      true
    );

    expect(Object.keys(importedIn('alpha')[0])).toEqual(['zion-agents']);
  });

  test('is found under its safe file name', async () => {
    write(P('a%3Ab'), profile('a:b'));

    expect(await configManagerImportCIMDProfiles('a:b', 'alpha')).toBe(true);

    expect(Object.keys(importedIn('alpha')[0])).toEqual(['a:b']);
  });

  test.each([false, true])(
    'whose file is missing fails in plain words whatever --allow-failures says (%s)',
    async (allowFailures) => {
      writeProfile('zion-tools');

      expect(
        await configManagerImportCIMDProfiles(
          'zion-agents',
          'alpha',
          allowFailures
        )
      ).toBe(false);

      expect(output()).toContain("No CIMD profile file 'zion-agents.json' in ");
      expect(importCIMDProfiles).not.toHaveBeenCalled();
    }
  );

  test('whose file cannot be read fails whatever --allow-failures says', async () => {
    write(P('zion-agents'), '{ not json');
    writeProfile('zion-tools');

    expect(
      await configManagerImportCIMDProfiles('zion-agents', 'alpha', true)
    ).toBe(false);

    expect(importCIMDProfiles).not.toHaveBeenCalled();
  });

  test('whose realm folder is missing fails', async () => {
    writeProfile('zion-agents', 'bravo');

    expect(await configManagerImportCIMDProfiles('zion-agents', 'alpha')).toBe(
      false
    );
  });

  test('needs a single realm: with the realms of the tree it is an error before any request', async () => {
    writeProfile('zion-agents', 'alpha');
    writeProfile('zion-agents', 'bravo');

    expect(await configManagerImportCIMDProfiles('zion-agents')).toBe(false);

    expect(output()).toContain(
      'Error: for a named CIMD profile, specify a single realm'
    );
    expect(isAvailable).not.toHaveBeenCalled();
    expect(importCIMDProfiles).not.toHaveBeenCalled();
  });
});

describe('a push never deletes', () => {
  test('nothing but the import is called on the library', async () => {
    writeProfile('zion-agents');
    const lib = (await import('@rockcarver/frodo-lib')).frodo.oauth2oidc.cimd;

    await configManagerImportCIMDProfiles();

    expect(Object.keys(lib).sort()).toEqual([
      'importCIMDProfiles',
      'isCIMDProfileAvailable',
      'readCIMDProfiles',
    ]);
    expect(readCIMDProfiles).not.toHaveBeenCalled();
  });
});
