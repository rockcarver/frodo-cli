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
 * `frodo config-manager push oauth-issuers` (frodo-cli#1256): the files that
 * `pull oauth-issuers` and `pull oauth2-agents` write
 * (`realms/<realm>/realm-config/agents/TrustedJwtIssuer/<name>.json`) are imported
 * into the matching realms, every file one operation of a run that goes on after a
 * failure (decision record 0040), `${NAME}` filled from the environment. A file of
 * another `_type` is refused before anything is sent for it; an issuer that did not
 * exist is written a second time so that the tenant equals the file (the server
 * completes an object it creates); what the command line names must work whatever
 * `--allow-failures` says (record 0041). Nothing is ever deleted.
 *
 * The library is a fake that records what it is asked to import; the working
 * directory is a real temporary tree; nothing here contacts a tenant.
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
let updates;

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

const readIssuers = jest.fn();
const readIssuer = jest.fn();
const importIssuers = jest.fn();
const updateIssuer = jest.fn();

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
      issuer: {
        readOAuth2TrustedJwtIssuers: readIssuers,
        readOAuth2TrustedJwtIssuer: readIssuer,
        importOAuth2TrustedJwtIssuers: importIssuers,
        updateOAuth2TrustedJwtIssuer: updateIssuer,
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
  configManagerExportTrustedJwtIssuers,
  configManagerImportTrustedJwtIssuers,
  trustedJwtIssuerFilePath,
} = await import(src('ops/OAuth2TrustedJwtIssuerConfigOps.ts'));

const output = () => printed.join('\n');
const write = (relative, content) => {
  const target = path.join(tmp, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  );
};

/** An issuer as a file of a pull holds it: every property wrapped, with `_id` and `_type`. */
const issuerObject = (id, extra = {}) => ({
  _id: id,
  _type: {
    _id: 'TrustedJwtIssuer',
    collection: true,
    name: 'OAuth2 Trusted JWT Issuer',
  },
  allowedSubjects: { inherited: false, value: [] },
  issuer: { inherited: false, value: `https://${id}.example.com` },
  ...extra,
});

const P = (id, realm = 'alpha') => trustedJwtIssuerFilePath(realm, id);
const writeIssuer = (id, realm = 'alpha', extra = {}) =>
  write(P(id, realm), issuerObject(id, extra));
/** What was imported in a realm: the import data of its calls. */
const importedIn = (realm) =>
  imports.filter((i) => i.realm === realm).map((i) => i.data.trustedJwtIssuer);

beforeEach(() => {
  deployment = 'cloud';
  currentRealm = undefined;
  printed = [];
  imports = [];
  updates = [];
  environment = {};
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-issuer-push-'));
  world = {
    realms: ['/', 'alpha', 'bravo'],
    issuers: {},
    listFails: false,
    importFails: new Map(),
    importThrows: new Set(),
    updateFails: new Map(),
  };
  readIssuers.mockReset().mockImplementation(async () => {
    if (world.listFails) throw new FrodoError('cannot list the issuers');
    return structuredClone(world.issuers[currentRealm] ?? []);
  });
  readIssuer.mockReset().mockImplementation(async (id) => {
    return structuredClone(
      (world.issuers[currentRealm] ?? []).find((i) => i._id === id)
    );
  });
  importIssuers
    .mockReset()
    .mockImplementation(async (importData, options, callback) => {
      imports.push({ realm: currentRealm, data: structuredClone(importData) });
      if (world.importThrows.has(currentRealm)) {
        throw new FrodoError(
          `Error importing ${currentRealm} realm trusted issuers`
        );
      }
      const results = [];
      for (const id of Object.keys(importData.trustedJwtIssuer)) {
        const message = world.importFails.get(id);
        if (message) {
          const error = new FrodoError(
            `Error importing ${currentRealm} realm trusted issuer ${id}`,
            new Error(message)
          );
          if (callback) callback(error, undefined);
          else throw error;
        } else {
          // the library completes nothing in the answer: it is not what the file said
          const result = {
            ...importData.trustedJwtIssuer[id],
            _id: id,
            completedByServer: true,
          };
          results.push(result);
          callback?.(undefined, result);
        }
      }
      return results;
    });
  updateIssuer.mockReset().mockImplementation(async (id, body) => {
    updates.push({ realm: currentRealm, id, body: structuredClone(body) });
    const failure = world.updateFails.get(id);
    if (failure) {
      throw new FrodoError(
        `Error updating ${currentRealm} realm trusted issuer ${id}`,
        new Error(failure)
      );
    }
    return body;
  });
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('the files of the tree', () => {
  test('Cloud: the issuers of alpha and bravo reach the library in one call per realm, keyed by _id, without _id and _rev', async () => {
    world.issuers.alpha = [issuerObject('zion-a'), issuerObject('zion-b')];
    writeIssuer('zion-a', 'alpha', { _rev: '-77' });
    writeIssuer('zion-b', 'alpha');
    writeIssuer('zion-a', 'bravo');

    expect(await configManagerImportTrustedJwtIssuers()).toBe(true);

    expect(imports).toHaveLength(2);
    const alpha = importedIn('alpha')[0];
    expect(Object.keys(alpha).sort()).toEqual(['zion-a', 'zion-b']);
    for (const body of Object.values(alpha)) {
      expect(body).not.toHaveProperty('_id');
      expect(body).not.toHaveProperty('_rev');
      expect(body._type._id).toBe('TrustedJwtIssuer');
    }
    expect(Object.keys(importedIn('bravo')[0])).toEqual(['zion-a']);
    expect(output()).toBe('');
  });

  test('the committed fixture of pull oauth2-agents is imported as it is, apart from _id and _rev', async () => {
    const fixture = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          'test/e2e/exports/fr-config-manager/forgeops/realms/alpha/realm-config/agents/TrustedJwtIssuer/testJWT.json'
        ),
        'utf8'
      )
    );
    world.issuers.alpha = [{ _id: 'testJWT' }];
    write(P('testJWT'), fixture);

    expect(await configManagerImportTrustedJwtIssuers()).toBe(true);

    const { _id, ...expected } = fixture;
    expect(importedIn('alpha')[0].testJWT).toEqual(expected);
    expect(importIssuers.mock.calls[0][0].trustedJwtIssuer.testJWT).toEqual(
      expected
    );
  });

  test('a ${NAME} is filled from the environment and an escaped \\${NAME} stays literal', async () => {
    environment.ZION_ISSUER_URL = 'https://issuer.zion.example.com';
    world.issuers.alpha = [{ _id: 'zion-a' }];
    write(P('zion-a'), {
      ...issuerObject('zion-a'),
      issuer: { inherited: false, value: '${ZION_ISSUER_URL}' },
      consentedScopesClaim: { inherited: false, value: '\\${LITERAL}' },
    });

    expect(await configManagerImportTrustedJwtIssuers()).toBe(true);

    const body = importedIn('alpha')[0]['zion-a'];
    expect(body.issuer.value).toBe('https://issuer.zion.example.com');
    expect(body.consentedScopesClaim.value).toBe('${LITERAL}');
  });

  test('plain files are handed on as they are too: nothing is reshaped', async () => {
    world.issuers.alpha = [{ _id: 'zion-plain' }];
    write(P('zion-plain'), {
      _id: 'zion-plain',
      issuer: 'https://plain.example.com',
      allowedSubjects: ['a'],
    });

    expect(await configManagerImportTrustedJwtIssuers()).toBe(true);

    expect(importedIn('alpha')[0]['zion-plain']).toEqual({
      issuer: 'https://plain.example.com',
      allowedSubjects: ['a'],
    });
  });

  test('a file without _id gets the file name as its id, decoded; a file whose _id differs from its name is pushed under the _id', async () => {
    world.issuers.alpha = [{ _id: 'a:b' }, { _id: 'zion-real-id' }];
    write(P('a%3Ab'), { issuer: { inherited: false, value: 'https://a' } });
    write(P('named-differently'), issuerObject('zion-real-id'));

    expect(await configManagerImportTrustedJwtIssuers()).toBe(true);

    expect(Object.keys(importedIn('alpha')[0]).sort()).toEqual([
      'a:b',
      'zion-real-id',
    ]);
  });

  test('a file that a pull wrote is pushed back as it was pulled (round trip)', async () => {
    const stored = issuerObject('zion-issuer', {
      _rev: '-1',
      jwksUri: { inherited: false, value: 'https://${HOST}/jwks' },
    });
    world.issuers.alpha = [stored];
    readIssuer.mockImplementation(async () => structuredClone(stored));
    readIssuers.mockImplementation(async () => [{ _id: 'zion-issuer' }]);
    expect(await configManagerExportTrustedJwtIssuers(undefined, 'alpha')).toBe(
      true
    );

    expect(await configManagerImportTrustedJwtIssuers(undefined, 'alpha')).toBe(
      true
    );

    const { _id, _rev, ...expected } = stored;
    expect(importedIn('alpha')[0]['zion-issuer']).toEqual(expected);
  });

  test('a realm folder without issuers is nothing; a tree without any issuer folder is an info line and a success', async () => {
    write('realms/alpha/realm-config/agents/OAuth2Client/zion-client.json', {});

    expect(await configManagerImportTrustedJwtIssuers()).toBe(true);

    expect(importIssuers).not.toHaveBeenCalled();
    expect(output()).toContain("No trusted JWT issuer files found in '");
  });

  test('a tree without a realms folder is an error', async () => {
    expect(await configManagerImportTrustedJwtIssuers()).toBe(false);

    expect(output()).toContain("There is no 'realms' folder in '");
    expect(importIssuers).not.toHaveBeenCalled();
  });
});

describe('the root realm', () => {
  test('of a Cloud tenant is skipped in the walk of the tree', async () => {
    writeIssuer('zion-a', '/');
    writeIssuer('zion-b', 'alpha');

    expect(await configManagerImportTrustedJwtIssuers()).toBe(true);

    expect(imports.map((i) => i.realm)).toEqual(['alpha']);
  });

  test('of a Cloud tenant given as the realm is a message and a success without a name, a failure with one', async () => {
    expect(await configManagerImportTrustedJwtIssuers(undefined, '/')).toBe(
      true
    );
    expect(output()).toContain(
      'The root realm of an Identity Cloud tenant has no trusted JWT issuers.'
    );
    expect(await configManagerImportTrustedJwtIssuers('zion-a', '/')).toBe(
      false
    );
    expect(importIssuers).not.toHaveBeenCalled();
  });

  test.each(['forgeops', 'classic'])(
    'of %s: the folder root is the realm / and is pushed',
    async (shape) => {
      deployment = shape;
      writeIssuer('zion-a', '/');

      expect(await configManagerImportTrustedJwtIssuers()).toBe(true);

      expect(imports.map((i) => i.realm)).toEqual(['/']);
    }
  );
});

describe('a file of another type', () => {
  test('is refused before anything is sent for it, naming the type; the other files are pushed', async () => {
    write(P('zion-agent'), {
      ...issuerObject('zion-agent'),
      _type: { _id: 'WebAgent', name: 'Web Agent', collection: true },
    });
    writeIssuer('zion-a');

    expect(await configManagerImportTrustedJwtIssuers()).toBe(false);

    expect(Object.keys(importedIn('alpha')[0])).toEqual(['zion-a']);
    expect(output()).toContain('1 of 2 trusted JWT issuers failed');
    expect(output()).toContain(
      "alpha/zion-agent.json: its _type is 'WebAgent', not 'TrustedJwtIssuer'"
    );
  });

  test('without a _type is accepted', async () => {
    write(P('zion-a'), { _id: 'zion-a', issuer: 'https://a.example.com' });

    expect(await configManagerImportTrustedJwtIssuers()).toBe(true);

    expect(Object.keys(importedIn('alpha')[0])).toEqual(['zion-a']);
  });
});

describe('failures', () => {
  test('a file with invalid JSON, one with an unresolved placeholder and one of another type are named in one summary, the valid one is imported, --allow-failures keeps the exit code at 0', async () => {
    world.issuers.alpha = [{ _id: 'zion-fine' }];
    write(P('zion-broken'), '{ not json');
    write(P('zion-placeholder'), {
      ...issuerObject('zion-placeholder'),
      issuer: { inherited: false, value: '${NOT_SET}' },
    });
    write(P('zion-agent'), {
      ...issuerObject('zion-agent'),
      _type: { _id: 'WebAgent' },
    });
    writeIssuer('zion-fine');

    expect(await configManagerImportTrustedJwtIssuers()).toBe(false);

    expect(Object.keys(importedIn('alpha')[0])).toEqual(['zion-fine']);
    expect(output()).toContain('3 of 4 trusted JWT issuers failed');
    expect(output()).toContain('alpha/zion-broken.json');
    expect(output()).toContain('alpha/zion-placeholder.json');
    expect(output()).toContain('No value found for placeholder "NOT_SET"');

    printed = [];
    expect(
      await configManagerImportTrustedJwtIssuers(undefined, undefined, true)
    ).toBe(true);
    expect(output()).toContain('The exit code stays 0');
  });

  test('the library reports one issuer as failed: it is named with the reason, the others are counted', async () => {
    world.issuers.alpha = [
      { _id: 'zion-a' },
      { _id: 'zion-b' },
      { _id: 'zion-c' },
    ];
    writeIssuer('zion-a');
    writeIssuer('zion-b');
    writeIssuer('zion-c');
    world.importFails.set('zion-b', 'Invalid attribute specified.');

    expect(await configManagerImportTrustedJwtIssuers()).toBe(false);

    expect(output()).toContain('1 of 3 trusted JWT issuers failed');
    expect(output()).toContain('alpha/zion-b: Invalid attribute specified.');
  });

  test('an issuer is named right when the keys are not in the order of the files', async () => {
    world.issuers.alpha = [{ _id: 'b' }, { _id: '10' }, { _id: '2' }];
    writeIssuer('b');
    writeIssuer('10');
    writeIssuer('2');
    world.importFails.set('2', 'refused');

    expect(await configManagerImportTrustedJwtIssuers()).toBe(false);

    expect(output()).toContain('alpha/2: refused');
    expect(output()).not.toContain('alpha/10:');
  });

  test('a whole call that fails is one failed operation named after the realm, and the next realm still runs', async () => {
    writeIssuer('zion-a', 'alpha');
    writeIssuer('zion-b', 'bravo');
    world.importThrows.add('alpha');

    expect(await configManagerImportTrustedJwtIssuers()).toBe(false);

    expect(imports.map((i) => i.realm)).toEqual(['alpha', 'bravo']);
    expect(output()).toContain('realm alpha');
  });

  test('a list of the existing issuers that cannot be read fails the realm and imports nothing in it', async () => {
    writeIssuer('zion-a');
    world.listFails = true;

    expect(await configManagerImportTrustedJwtIssuers()).toBe(false);

    expect(importIssuers).not.toHaveBeenCalled();
    expect(output()).toContain('realm alpha');
  });

  test('two files for one id are a named failure for the second, ignoring case; the first is pushed', async () => {
    world.issuers.alpha = [{ _id: 'Zion' }];
    write(P('zion-1'), issuerObject('Zion'));
    write(P('zion-2'), issuerObject('zion'));

    expect(await configManagerImportTrustedJwtIssuers()).toBe(false);

    expect(Object.keys(importedIn('alpha')[0])).toEqual(['Zion']);
    expect(output()).toContain(
      "two files for trusted JWT issuer 'zion' in realm 'alpha': zion-2.json is ignored"
    );
  });
});

describe('create, then update', () => {
  test('an issuer that did not exist is written a second time with the body of its file, one that existed is not', async () => {
    world.issuers.alpha = [{ _id: 'zion-old' }];
    write(P('zion-old'), issuerObject('zion-old'));
    write(P('zion-new'), issuerObject('zion-new', { _rev: '-3' }));

    expect(await configManagerImportTrustedJwtIssuers()).toBe(true);

    expect(updates.map((u) => u.id)).toEqual(['zion-new']);
    const { _id, _rev, ...expected } = issuerObject('zion-new');
    // the body of the file, not what the first write answered
    expect(updates[0].body).toEqual(expected);
    expect(updates[0].body).not.toHaveProperty('completedByServer');
    expect(importIssuers).toHaveBeenCalledTimes(1);
    expect(output()).not.toContain('failed');
  });

  test('the existing ids are compared ignoring case', async () => {
    world.issuers.alpha = [{ _id: 'ZION-A' }];
    write(P('zion-a'), issuerObject('zion-a'));

    expect(await configManagerImportTrustedJwtIssuers()).toBe(true);

    expect(updates).toEqual([]);
  });

  test('a second write that fails makes the issuer a named failure that says it was created', async () => {
    write(P('zion-new'), issuerObject('zion-new'));
    world.updateFails.set('zion-new', 'the server answered 500');

    expect(await configManagerImportTrustedJwtIssuers()).toBe(false);

    expect(output()).toContain('1 of 1 trusted JWT issuer failed');
    expect(output()).toContain(
      'alpha/zion-new: created, but the second write that makes it equal to the file failed: the server answered 500'
    );
  });

  test('an issuer whose first write failed is not written a second time', async () => {
    write(P('zion-new'), issuerObject('zion-new'));
    world.importFails.set('zion-new', 'refused');

    expect(await configManagerImportTrustedJwtIssuers()).toBe(false);

    expect(updates).toEqual([]);
  });
});

describe('a named issuer', () => {
  test('pushes the file of that name only', async () => {
    world.issuers.alpha = [{ _id: 'zion-a' }];
    writeIssuer('zion-a');
    writeIssuer('zion-b');

    expect(await configManagerImportTrustedJwtIssuers('zion-a', 'alpha')).toBe(
      true
    );

    expect(Object.keys(importedIn('alpha')[0])).toEqual(['zion-a']);
  });

  test.each([false, true])(
    'whose file is missing fails in plain words whatever --allow-failures says (%s)',
    async (allowFailures) => {
      writeIssuer('zion-b');

      expect(
        await configManagerImportTrustedJwtIssuers(
          'zion-a',
          'alpha',
          allowFailures
        )
      ).toBe(false);

      expect(output()).toContain(
        "No trusted JWT issuer file 'zion-a.json' in "
      );
      expect(importIssuers).not.toHaveBeenCalled();
    }
  );

  test('whose file cannot be read fails whatever --allow-failures says', async () => {
    write(P('zion-a'), '{ not json');

    expect(
      await configManagerImportTrustedJwtIssuers('zion-a', 'alpha', true)
    ).toBe(false);

    expect(importIssuers).not.toHaveBeenCalled();
  });

  test('whose file is of another type fails whatever --allow-failures says', async () => {
    write(P('zion-a'), {
      ...issuerObject('zion-a'),
      _type: { _id: 'WebAgent' },
    });

    expect(
      await configManagerImportTrustedJwtIssuers('zion-a', 'alpha', true)
    ).toBe(false);
  });

  test('needs a single realm: with the realms of the tree it is an error before any request', async () => {
    writeIssuer('zion-a', 'alpha');
    writeIssuer('zion-a', 'bravo');

    expect(await configManagerImportTrustedJwtIssuers('zion-a')).toBe(false);

    expect(output()).toContain(
      'Error: for a named trusted JWT issuer, specify a single realm'
    );
    expect(importIssuers).not.toHaveBeenCalled();
  });
});

describe('a push never deletes and asks nothing about availability', () => {
  test('the library is asked to list, import and update, nothing else', async () => {
    writeIssuer('zion-a');
    const lib = (await import('@rockcarver/frodo-lib')).frodo.oauth2oidc.issuer;

    await configManagerImportTrustedJwtIssuers();

    expect(Object.keys(lib).sort()).toEqual([
      'importOAuth2TrustedJwtIssuers',
      'readOAuth2TrustedJwtIssuer',
      'readOAuth2TrustedJwtIssuers',
      'updateOAuth2TrustedJwtIssuer',
    ]);
    expect(readIssuer).not.toHaveBeenCalled();
  });
});
