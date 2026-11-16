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
 * `frodo config-manager push oauth-software-publishers` (frodo-cli#1343): the
 * files `realms/<realm>/realm-config/agents/SoftwarePublisher/<name>.json` that
 * `pull oauth-software-publishers` (and `pull oauth2-agents` before it) write
 * are imported with the generic agent function of the library (`importAgent`, a
 * PUT by type and id: the library has no module of its own for the type). A
 * publisher that does not exist is created and one that does is replaced by the
 * file; a file of another `_type` is refused before anything is sent for it, and a
 * file without `_type` gets the one of a publisher so that the library can route
 * it; a publisher that did not exist is written a second time so that the tenant
 * equals the file (the server may complete an object it creates); what the command
 * line names must work whatever `--allow-failures` says (record 0041); a realm that
 * does not offer the type is skipped with a warning. Nothing is ever deleted.
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

const readAgents = jest.fn();
const readAgentTypes = jest.fn();
const importAgent = jest.fn();
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
      getFilePath: (relative, create) => {
        const target = path.join(tmp, relative);
        if (create) fs.mkdirSync(path.dirname(target), { recursive: true });
        return target;
      },
      getWorkingDirectory: () => tmp,
      saveJsonToFile: jest.fn(),
      readJsonFile,
      escapePlaceholders,
      findFilesByName: jest.fn(),
      isBase64Encoded: jest.fn(),
      json: { mergeDeep: (a) => a },
    },
    realm: {
      readRealms: jest.fn(async () => world.realms.map((name) => ({ name }))),
    },
    agent: { readAgents, readAgentTypes, importAgent, deleteAgent },
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

const { configManagerImportSoftwarePublishers, softwarePublisherFilePath } =
  await import(src('ops/SoftwarePublisherConfigOps.ts'));

const output = () => printed.join('\n');
const write = (relative, content) => {
  const target = path.join(tmp, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  );
};

const TYPE = {
  _id: 'SoftwarePublisher',
  collection: true,
  name: 'OAuth2 Software Publisher',
};

/** A publisher as a file of a pull holds it: every property wrapped, with `_id` and `_type`. */
const publisherObject = (id, extra = {}) => ({
  _id: id,
  _type: TYPE,
  issuer: { inherited: false, value: `https://${id}.example.com` },
  jwksUri: { inherited: false, value: `https://${id}.example.com/jwks` },
  ...extra,
});

const P = (id, realm = 'alpha') => softwarePublisherFilePath(realm, id);
const writePublisher = (id, realm = 'alpha', extra = {}) =>
  write(P(id, realm), publisherObject(id, extra));
/** What was sent for a realm: the id and the object of each import call, in order. */
const sentIn = (realm) =>
  imports
    .filter((i) => i.realm === realm)
    .map((i) => ({
      id: i.id,
      object: i.data.agent[i.id],
      globalConfig: i.globalConfig,
    }));

beforeEach(() => {
  deployment = 'cloud';
  currentRealm = undefined;
  printed = [];
  imports = [];
  environment = {};
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-publisher-push-'));
  world = {
    realms: ['/', 'alpha', 'bravo'],
    // the publishers that exist in the tenant, by realm
    publishers: {},
    others: {},
    types: ['WebAgent', 'SoftwarePublisher'],
    listFails: false,
    typesFail: false,
    // the n-th write (1 or 2) of an id that fails, by "<id>#<n>"
    importFails: new Map(),
    calls: new Map(),
  };
  readAgentTypes.mockReset().mockImplementation(async () => {
    if (world.typesFail) throw new FrodoError('cannot read the agent types');
    return world.types;
  });
  readAgents.mockReset().mockImplementation(async () => {
    if (world.listFails) throw new FrodoError('cannot list the agents');
    return [
      ...(world.others[currentRealm] ?? []),
      ...(world.publishers[currentRealm] ?? []).map((id) => ({
        _id: id,
        _type: TYPE,
      })),
    ];
  });
  importAgent.mockReset().mockImplementation(async (id, data, globalConfig) => {
    const n = (world.calls.get(`${currentRealm}/${id}`) ?? 0) + 1;
    world.calls.set(`${currentRealm}/${id}`, n);
    imports.push({
      realm: currentRealm,
      id,
      data: structuredClone(data),
      globalConfig,
      n,
    });
    const failure = world.importFails.get(`${id}#${n}`);
    if (failure) {
      throw new FrodoError(
        `Error importing ${currentRealm} realm agent ${id}`,
        new Error(failure)
      );
    }
    return data.agent[id];
  });
  deleteAgent.mockReset();
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('Cloud: realms alpha and bravo', () => {
  test('sends the files of each realm with the generic import, in the realm it is in, without _id and _rev, and never deletes', async () => {
    writePublisher('zion-publisher', 'alpha', { _rev: '-3' });
    writePublisher('matrix-publisher', 'bravo');
    world.publishers.alpha = ['zion-publisher'];
    world.publishers.bravo = ['matrix-publisher'];

    expect(await configManagerImportSoftwarePublishers()).toBe(true);

    expect(sentIn('alpha')).toHaveLength(1);
    expect(sentIn('bravo')).toHaveLength(1);
    const [sent] = sentIn('alpha');
    expect(sent.id).toBe('zion-publisher');
    expect(sent.globalConfig).toBe(false);
    expect(sent.object.issuer.value).toBe('https://zion-publisher.example.com');
    expect(sent.object._type).toEqual(TYPE);
    expect(sent.object).not.toHaveProperty('_rev');
    expect(sent.object).not.toHaveProperty('_id');
    expect(deleteAgent).not.toHaveBeenCalled();
  });

  test('replaces a publisher that exists with one write, ignoring the case of the id', async () => {
    writePublisher('Zion-Publisher');
    world.publishers.alpha = ['zion-publisher'];

    expect(await configManagerImportSoftwarePublishers()).toBe(true);

    expect(sentIn('alpha')).toHaveLength(1);
  });

  test.each(['My Publisher', 'MY PUBLISHER', 'my publisher'])(
    'a file for %p replaces the existing publisher "My Publisher" (capitals and a space in the stored id) with exactly one write',
    async (fileId) => {
      writePublisher(fileId);
      world.publishers.alpha = ['My Publisher'];

      expect(await configManagerImportSoftwarePublishers()).toBe(true);

      expect(sentIn('alpha')).toHaveLength(1);
      expect(sentIn('alpha')[0].id).toBe(fileId);
    }
  );

  test('a new publisher whose id has capitals and a space still gets two writes, next to an existing one that gets one', async () => {
    writePublisher('My Publisher');
    writePublisher('Zion New');
    world.publishers.alpha = ['My Publisher'];

    expect(await configManagerImportSoftwarePublishers()).toBe(true);

    const ids = sentIn('alpha').map((sent) => sent.id);
    expect(ids.filter((id) => id === 'My Publisher')).toHaveLength(1);
    expect(ids.filter((id) => id === 'Zion New')).toHaveLength(2);
  });

  test('writes a publisher that did not exist a second time, with the same body, so that the tenant equals the file', async () => {
    writePublisher('zion-publisher');
    world.publishers.alpha = [];

    expect(await configManagerImportSoftwarePublishers()).toBe(true);

    const sent = sentIn('alpha');
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
  });

  test('says nothing when every file was sent', async () => {
    writePublisher('zion-publisher');
    world.publishers.alpha = ['zion-publisher'];

    expect(await configManagerImportSoftwarePublishers()).toBe(true);

    expect(output()).not.toContain('ERROR');
    expect(output()).not.toContain('WARN');
  });
});

describe('the files', () => {
  test('a file without _type gets the _type of a software publisher, so that the library can route it', async () => {
    write(P('small'), { issuer: { value: 'https://small.example.com' } });
    world.publishers.alpha = ['small'];

    expect(await configManagerImportSoftwarePublishers()).toBe(true);

    const [sent] = sentIn('alpha');
    expect(sent.id).toBe('small');
    expect(sent.object._type).toEqual(TYPE);
    expect(sent.object.issuer.value).toBe('https://small.example.com');
  });

  test('a file that has a _type keeps it', async () => {
    write(P('own-type'), {
      _id: 'own-type',
      _type: { _id: 'SoftwarePublisher', name: 'Own name', collection: false },
    });
    world.publishers.alpha = ['own-type'];

    expect(await configManagerImportSoftwarePublishers()).toBe(true);

    expect(sentIn('alpha')[0].object._type.name).toBe('Own name');
  });

  test('a file of another _type is refused before anything is sent for it, and the others are still pushed', async () => {
    write(P('imposter'), {
      _id: 'imposter',
      _type: { _id: 'WebAgent' },
    });
    writePublisher('zion-publisher');
    world.publishers.alpha = ['zion-publisher'];

    expect(await configManagerImportSoftwarePublishers()).toBe(false);

    expect(sentIn('alpha').map((s) => s.id)).toEqual(['zion-publisher']);
    expect(output()).toContain(
      "its _type is 'WebAgent', not 'SoftwarePublisher'"
    );
  });

  test('a placeholder in a file is filled from the environment of the run, an escaped one stays', async () => {
    environment.ZION_JWKS = 'https://zion.example.com/jwks';
    write(
      P('zion-publisher'),
      publisherObject('zion-publisher', {
        jwksUri: { inherited: false, value: '${ZION_JWKS}' },
        issuer: { inherited: false, value: '\\${LITERAL}' },
      })
    );
    world.publishers.alpha = ['zion-publisher'];

    expect(await configManagerImportSoftwarePublishers()).toBe(true);

    const [sent] = sentIn('alpha');
    expect(sent.object.jwksUri.value).toBe('https://zion.example.com/jwks');
    expect(sent.object.issuer.value).toBe('${LITERAL}');
  });

  test('a placeholder that has no value is a named failure of its file, and the others are still pushed', async () => {
    write(
      P('zion-missing'),
      publisherObject('zion-missing', {
        jwksUri: { inherited: false, value: '${NO_SUCH_VALUE}' },
      })
    );
    writePublisher('zion-publisher');
    world.publishers.alpha = ['zion-publisher'];

    expect(await configManagerImportSoftwarePublishers()).toBe(false);

    expect(output()).toContain('NO_SUCH_VALUE');
    expect(sentIn('alpha').map((s) => s.id)).toEqual(['zion-publisher']);
  });
});

describe('failures', () => {
  test('a publisher that cannot be written is named and the others are still pushed; --allow-failures reports it and succeeds', async () => {
    writePublisher('zion-bad');
    writePublisher('zion-good');
    world.publishers.alpha = ['zion-bad', 'zion-good'];
    world.importFails.set('zion-bad#1', 'the server answered 400');

    expect(await configManagerImportSoftwarePublishers()).toBe(false);

    expect(sentIn('alpha').map((s) => s.id)).toEqual(['zion-bad', 'zion-good']);
    expect(output()).toContain('alpha/zion-bad');
    expect(output()).toContain('the server answered 400');

    world.calls.clear();
    imports = [];
    printed = [];
    expect(
      await configManagerImportSoftwarePublishers(undefined, undefined, true)
    ).toBe(true);
    expect(output()).toContain('alpha/zion-bad');
  });

  test('a failed first write of a new publisher is not written a second time', async () => {
    writePublisher('zion-new');
    world.publishers.alpha = [];
    world.importFails.set('zion-new#1', 'the server answered 400');

    expect(await configManagerImportSoftwarePublishers()).toBe(false);

    expect(sentIn('alpha')).toHaveLength(1);
  });

  test('a failed second write says that the publisher was created', async () => {
    writePublisher('zion-new');
    world.publishers.alpha = [];
    world.importFails.set('zion-new#2', 'the server answered 500');

    expect(await configManagerImportSoftwarePublishers()).toBe(false);

    expect(sentIn('alpha')).toHaveLength(2);
    expect(output()).toContain(
      'alpha/zion-new: created, but the second write that makes it equal to the file failed'
    );
    expect(output()).toContain('the server answered 500');
  });

  test('a realm whose agents cannot be listed is one failed operation and nothing is sent in it', async () => {
    writePublisher('zion-publisher');
    world.listFails = true;

    expect(await configManagerImportSoftwarePublishers()).toBe(false);

    expect(imports).toEqual([]);
    expect(output()).toContain('cannot list the agents');
  });
});

describe('a realm that does not offer the agent type', () => {
  beforeEach(() => {
    world.types = ['WebAgent'];
    writePublisher('zion-publisher');
  });

  test('is skipped with one warning, nothing is sent and the run succeeds', async () => {
    expect(await configManagerImportSoftwarePublishers()).toBe(true);

    expect(imports).toEqual([]);
    expect(readAgents).not.toHaveBeenCalled();
    expect(output()).toContain(
      "WARN Realm 'alpha' does not offer software publishers on this deployment: 1 file in"
    );
  });

  test('is a failure when a publisher was named: the file must be pushed', async () => {
    expect(
      await configManagerImportSoftwarePublishers('zion-publisher', 'alpha')
    ).toBe(false);

    expect(imports).toEqual([]);
    expect(output()).toContain("so 'zion-publisher' cannot be pushed");
  });

  test('is a failed realm when its list of agent types cannot be read', async () => {
    world.types = ['SoftwarePublisher'];
    world.typesFail = true;

    expect(await configManagerImportSoftwarePublishers()).toBe(false);

    expect(imports).toEqual([]);
    expect(output()).toContain('cannot read the agent types');
  });
});

describe('one publisher by name', () => {
  test('pushes only the file of that publisher, in a single realm', async () => {
    writePublisher('zion-publisher');
    writePublisher('zion-other');
    world.publishers.alpha = ['zion-publisher', 'zion-other'];

    expect(
      await configManagerImportSoftwarePublishers('zion-publisher', 'alpha')
    ).toBe(true);

    expect(sentIn('alpha').map((s) => s.id)).toEqual(['zion-publisher']);
  });

  test('needs a single realm: with the files of two realms in the tree and no realm given, nothing is pushed, whatever --allow-failures says', async () => {
    writePublisher('zion-publisher', 'alpha');
    writePublisher('matrix-publisher', 'bravo');

    for (const allowFailures of [false, true]) {
      expect(
        await configManagerImportSoftwarePublishers(
          'zion-publisher',
          undefined,
          allowFailures
        )
      ).toBe(false);
    }
    expect(output()).toContain(
      'Error: for a named software publisher, specify a single realm'
    );
    expect(imports).toEqual([]);
  });

  test('needs a file that exists, whatever --allow-failures says', async () => {
    writePublisher('zion-publisher');

    for (const allowFailures of [false, true]) {
      expect(
        await configManagerImportSoftwarePublishers(
          'missing',
          'alpha',
          allowFailures
        )
      ).toBe(false);
    }
    expect(output()).toContain("No software publisher file 'missing.json' in");
    expect(imports).toEqual([]);
  });
});
