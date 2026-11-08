import realFs from 'node:fs';
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
 * Decision record 0040 for the bulk imports of `authz policy`, `authz set`,
 * `authz type`, `esv secret`, `esv variable`, `secretstore`, `server`,
 * `iga workflow` and `admin federation`. When one item of a bulk import fails
 * (the library cannot import it, or its file cannot be parsed), the others are
 * still imported, one summary names the failed one, and the command fails,
 * unless --allow-failures was given. A file or directory that cannot be read
 * fails the command whatever the flag says. A clean run prints no summary.
 *
 * The real import graph of the ops modules pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the library is a deep
 * stub, the file system is a map of file names to contents, and every relative
 * import of the modules under test is a set of spies (OperationRun,
 * ErrorCause and ImportItems stay real, and so do the modules themselves).
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

/** A function that is a spy and, for any property read, another such function. */
function deepStub() {
  const children = new Map();
  return new Proxy(jest.fn(), {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (!children.has(prop)) children.set(prop, deepStub());
      return children.get(prop);
    },
  });
}

class FrodoError extends Error {
  constructor(message, originalErrors) {
    super(message);
    this.name = 'FrodoError';
    this.originalErrors = originalErrors;
  }
}
const frodo = deepStub();
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo,
  state: deepStub(),
  FrodoError,
}));

/** The files the modules under test can read; any other path is read for real. */
const virtualFiles = new Map();
/** The directories they can list. */
const virtualDirs = new Map();
const noSuchFile = (file) =>
  Object.assign(
    new Error(`ENOENT: no such file or directory, open '${file}'`),
    {
      code: 'ENOENT',
    }
  );
const fsMock = {
  readFileSync: (file, ...rest) => {
    if (virtualFiles.has(file)) {
      const content = virtualFiles.get(file);
      if (content instanceof Error) throw content;
      return content;
    }
    if (String(file).startsWith('dir/') || file === 'missing.json') {
      throw noSuchFile(file);
    }
    return realFs.readFileSync(file, ...rest);
  },
  readdirSync: (dir, ...rest) => {
    if (virtualDirs.has(dir)) {
      const names = virtualDirs.get(dir);
      if (names instanceof Error) throw names;
      return names;
    }
    return realFs.readdirSync(dir, ...rest);
  },
};
jest.unstable_mockModule('fs', () => ({ default: fsMock, ...fsMock }));

const FILES = {
  policy: 'src/ops/PolicyOps.ts',
  policySet: 'src/ops/PolicySetOps.ts',
  resourceType: 'src/ops/ResourceTypeOps.ts',
  secret: 'src/ops/cloud/SecretsOps.ts',
  variable: 'src/ops/cloud/VariablesOps.ts',
  secretStore: 'src/ops/SecretStoreOps.ts',
  server: 'src/ops/classic/ServerOps.ts',
  workflow: 'src/ops/cloud/iga/IgaWorkflowOps.ts',
  adminFederation: 'src/ops/cloud/AdminFederationOps.ts',
};

// every relative import of the modules under test becomes spies, except the
// run tracker, the error cause and the import helper
const REAL = ['/utils/OperationRun', '/utils/ErrorCause', '/utils/ImportItems'];
const mocked = new Map();
for (const file of Object.values(FILES)) {
  const source = realFs.readFileSync(path.resolve(root, file), 'utf8');
  const importer = path.dirname(path.resolve(root, file));
  for (const [, clause, from] of source.matchAll(
    /^import (?!type )([^;]*?) from '(\.[^']+)';/gms
  )) {
    const target = path.resolve(importer, from).replace(/\.(js|ts)$/, '');
    if (REAL.some((real) => target.endsWith(real))) continue;
    const names = mocked.get(target) ?? new Set();
    const named = clause.match(/\{([^}]*)\}/s)?.[1] ?? '';
    for (const part of named.split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0];
      if (name && !part.trim().startsWith('type ')) names.add(name);
    }
    if (/^[A-Za-z_$][\w$]*\s*(,|$)/.test(clause.trim())) names.add('default');
    mocked.set(target, names);
  }
}
// the real OperationRun prints through these
const consoleTarget = path.resolve(root, 'src/utils/Console');
mocked.set(
  consoleTarget,
  new Set([...(mocked.get(consoleTarget) ?? []), 'printError', 'printMessage'])
);
const colorTarget = path.resolve(root, 'src/utils/ColorTheme');
const spies = new Map();
for (const [target, names] of mocked) {
  const exports = {};
  for (const name of names) exports[name] = jest.fn();
  if (target === colorTarget) {
    // the color theme returns its text
    exports.default = new Proxy({}, { get: () => (text) => text });
  }
  spies.set(target, exports);
  jest.unstable_mockModule(target, () => exports);
}
const { printError, printMessage } = spies.get(consoleTarget);

const ops = {};
for (const [key, file] of Object.entries(FILES)) {
  ops[key] = await import(path.resolve(root, file));
}

const summary = () => printMessage.mock.calls.map(([text]) => text).join('\n');
const level = () => printMessage.mock.calls[0]?.[1];

const IDS = ['a', 'b', 'c', 'd'];
let failing;
let exitCodeBefore;

/** The parsed content of an export file with the given items under `key`. */
const doc = (key, ids) =>
  JSON.stringify({
    [key]: Object.fromEntries(ids.map((id) => [id, { _id: id, name: id }])),
  });

beforeEach(() => {
  jest.clearAllMocks();
  exitCodeBefore = process.exitCode;
  process.exitCode = undefined;
  failing = new Set();
  virtualFiles.clear();
  virtualDirs.clear();
  frodo.utils.getFilePath.mockReset().mockImplementation((file) => file);
  frodo.utils.getWorkingDirectory.mockReset().mockImplementation(() => 'dir');
  frodo.utils.readFiles.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  process.exitCode = exitCodeBefore;
});

// The library stubs are Proxies, which the spy matchers do not accept: calls are asserted on `mock.calls`.

/**
 * What the library's bulk import does: it tries every item and, if some failed
 * (the ids in `failing`), throws ONE error with one nested error per failed item.
 */
const libImport = (key, kind, result = (id) => ({ _id: id })) =>
  jest.fn(async (data) => {
    const ids = Object.keys(data[key]);
    const errors = ids
      .filter((id) => failing.has(id))
      .map(
        (id) =>
          new FrodoError(`Error importing ${kind} ${id}`, [
            new Error(`could not import ${id}`),
          ])
      );
    if (errors.length > 0) {
      throw new FrodoError(`Error importing ${kind}s`, errors);
    }
    return ids.map(result);
  });

/** The commands whose library function imports the items of one parsed file and throws one combined error. */
const CASES = [
  {
    name: 'authz policy import',
    key: 'policy',
    kind: 'policy',
    plural: 'policies',
    ext: '.policy.authz.json',
    lib: () => frodo.authz.policy.importPolicies,
    one: (file, allow) =>
      ops.policy.importPoliciesFromFile(
        file,
        { deps: true, prereqs: false },
        allow
      ),
    many: (allow) =>
      ops.policy.importPoliciesFromFiles({ deps: true, prereqs: false }, allow),
  },
  {
    name: 'authz set import',
    key: 'policyset',
    kind: 'policy set',
    plural: 'policy sets',
    ext: '.policyset.authz.json',
    lib: () => frodo.authz.policySet.importPolicySets,
    one: (file, allow) =>
      ops.policySet.importPolicySetsFromFile(
        file,
        { deps: true, prereqs: false },
        allow
      ),
    many: (allow) =>
      ops.policySet.importPolicySetsFromFiles(
        { deps: true, prereqs: false },
        allow
      ),
  },
  {
    name: 'authz type import',
    key: 'resourcetype',
    kind: 'resource type',
    plural: 'resource types',
    ext: '.resourcetype.authz.json',
    lib: () => frodo.authz.resourceType.importResourceTypes,
    one: (file, allow) =>
      ops.resourceType.importResourceTypesFromFile(file, allow),
    many: (allow) => ops.resourceType.importResourceTypesFromFiles(allow),
  },
  {
    name: 'esv secret import',
    key: 'secret',
    kind: 'secret',
    plural: 'secrets',
    ext: '.secret.json',
    lib: () => frodo.cloud.secret.importSecrets,
    one: (file, allow) =>
      ops.secret.importSecretsFromFile(file, false, undefined, allow),
    many: (allow) => ops.secret.importSecretsFromFiles(false, undefined, allow),
  },
  {
    name: 'esv variable import',
    key: 'variable',
    kind: 'variable',
    plural: 'variables',
    ext: '.variable.json',
    lib: () => frodo.cloud.variable.importVariables,
    one: (file, allow) => ops.variable.importVariablesFromFile(file, allow),
    many: (allow) => ops.variable.importVariablesFromFiles(allow),
  },
  {
    name: 'admin federation import',
    key: 'idp',
    kind: 'provider',
    plural: 'providers',
    ext: '.admin.federation.json',
    lib: () => frodo.cloud.adminFed.importAdminFederationProviders,
    one: (file, allow) =>
      ops.adminFederation.importAdminFederationProvidersFromFile(file, allow),
    many: (allow) =>
      ops.adminFederation.importAdminFederationProvidersFromFiles(allow),
  },
  {
    name: 'server import',
    key: 'server',
    kind: 'server',
    plural: 'servers',
    ext: '.server.json',
    // a server file also holds the default properties, and the files of -A are read through the library
    content: (ids) =>
      JSON.stringify({
        server: Object.fromEntries(
          ids.map((id) => [
            id,
            { _id: id, url: `http://${id}.example.com`, properties: {} },
          ])
        ),
        defaultProperties: {},
      }),
    lib: () => frodo.server.importServers,
    libArgument: (call) => call[0],
    result: () => ({}),
    one: (file, allow) =>
      ops.server.importServersFromFile(file, { includeDefault: false }, allow),
    many: (allow) =>
      ops.server.importServersFromFiles({ includeDefault: false }, allow),
    listing: (dir, files) =>
      frodo.utils.readFiles.mockResolvedValue(
        Object.entries(files).map(([name, content]) => ({
          path: `${dir}/${name}`,
          content,
        }))
      ),
  },
];

describe.each(CASES)('$name', (c) => {
  const content = (ids) => (c.content ? c.content(ids) : doc(c.key, ids));
  const lib = () => c.lib();
  /** The items of the file the library was given in call number `n`. */
  const itemsOf = (n) =>
    Object.keys(
      (c.libArgument ?? ((call) => call[0]))(lib().mock.calls[n])[c.key]
    );
  /** Puts files in the directory of -A and lists them. */
  const putFiles = (files) => {
    if (c.listing) {
      for (const [name, text] of Object.entries(files)) {
        virtualFiles.set(`dir/${name}`, text);
      }
      c.listing('dir', files);
      return;
    }
    virtualDirs.set('dir', [...Object.keys(files), 'unrelated.txt']);
    for (const [name, text] of Object.entries(files))
      virtualFiles.set(name, text);
  };

  beforeEach(() => {
    lib()
      .mockReset()
      .mockImplementation(
        libImport(c.key, c.kind, c.result).getMockImplementation()
      );
  });

  describe('-a (every item of one file)', () => {
    const file = 'items.json';

    test('imports every item and prints no summary when nothing failed', async () => {
      virtualFiles.set(file, content(IDS));

      expect(await c.one(file)).toBe(true);

      expect(lib().mock.calls).toHaveLength(1);
      expect(itemsOf(0)).toEqual(IDS);
      expect(printMessage).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
    });

    test('names the item that failed in one summary and fails, the others were imported', async () => {
      virtualFiles.set(file, content(IDS));
      failing.add('b');

      expect(await c.one(file)).toBe(false);

      // the library got the whole file once and tried every item
      expect(lib().mock.calls).toHaveLength(1);
      expect(itemsOf(0)).toEqual(IDS);
      // the combined error is shown once, then the summary
      expect(printError).toHaveBeenCalledTimes(1);
      expect(printMessage).toHaveBeenCalledTimes(1);
      expect(level()).toBe('error');
      expect(summary()).toBe(
        `1 of 4 ${c.plural} failed:\n  - Error importing ${c.kind} b: could not import b`
      );
      // the ops function leaves the exit code to its caller (record 0033)
      expect(process.exitCode).toBeUndefined();
    });

    test('names every failed item when several fail', async () => {
      virtualFiles.set(file, content(IDS));
      failing.add('a');
      failing.add('d');

      expect(await c.one(file)).toBe(false);
      expect(summary()).toBe(
        `2 of 4 ${c.plural} failed:\n  - Error importing ${c.kind} a: could not import a\n  - Error importing ${c.kind} d: could not import d`
      );
    });

    test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
      virtualFiles.set(file, content(IDS));
      failing.add('c');

      expect(await c.one(file, true)).toBe(true);

      expect(printError).toHaveBeenCalledTimes(1);
      expect(level()).toBe('warn');
      expect(summary()).toContain(`1 of 4 ${c.plural} failed`);
      expect(summary()).toContain(
        'The exit code stays 0 because --allow-failures was given.'
      );
    });

    test('an error that names no item is one failure named by the file', async () => {
      virtualFiles.set(file, content(IDS));
      lib().mockReset().mockRejectedValue(new Error('boom'));

      expect(await c.one(file)).toBe(false);
      // the file as a whole is the failed operation: the library named no item
      expect(summary()).toBe(`1 of 1 ${c.kind} failed:\n  - ${file}: boom`);
    });

    test('a file that cannot be parsed fails the command whatever --allow-failures says', async () => {
      virtualFiles.set(file, '{ not json');

      expect(await c.one(file, true)).toBe(false);

      expect(lib().mock.calls).toHaveLength(0);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(printMessage).not.toHaveBeenCalled(); // the error is shown once, no summary
    });

    test('a file that does not exist fails the command whatever --allow-failures says', async () => {
      expect(await c.one('missing.json', true)).toBe(false);

      expect(lib().mock.calls).toHaveLength(0);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(printMessage).not.toHaveBeenCalled();
    });
  });

  describe('-A (every file of a directory)', () => {
    const first = `first${c.ext}`;
    const second = `second${c.ext}`;

    test('imports the items of every file and prints no summary when nothing failed', async () => {
      putFiles({ [first]: content(['a', 'b']), [second]: content(['c', 'd']) });

      expect(await c.many()).toBe(true);

      expect(lib().mock.calls.length).toBeGreaterThanOrEqual(1);
      const imported = lib().mock.calls.flatMap((_call, n) => itemsOf(n));
      expect(imported.sort()).toEqual(IDS);
      expect(printMessage).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
    });

    test('a failing item does not keep the other files from being imported and is named in one summary', async () => {
      putFiles({ [first]: content(['a', 'b']), [second]: content(['c', 'd']) });
      failing.add('c');

      expect(await c.many()).toBe(false);

      const imported = lib().mock.calls.flatMap((_call, n) => itemsOf(n));
      expect(imported.sort()).toEqual(IDS);
      expect(printMessage).toHaveBeenCalledTimes(1);
      expect(level()).toBe('error');
      expect(summary()).toBe(
        `1 of 4 ${c.plural} failed:\n  - Error importing ${c.kind} c: could not import c`
      );
    });

    test('--allow-failures keeps the command successful', async () => {
      putFiles({ [first]: content(['a', 'b']), [second]: content(['c', 'd']) });
      failing.add('b');

      expect(await c.many(true)).toBe(true);

      expect(level()).toBe('warn');
      expect(summary()).toContain(`1 of 4 ${c.plural} failed`);
      expect(summary()).toContain(
        'The exit code stays 0 because --allow-failures was given.'
      );
    });

    test('a file that cannot be parsed is a named failure and the others are still imported', async () => {
      putFiles({ [first]: '{ not json', [second]: content(['c', 'd']) });

      expect(await c.many()).toBe(false);

      const imported = lib().mock.calls.flatMap((_call, n) => itemsOf(n));
      expect(imported.sort()).toEqual(['c', 'd']);
      expect(summary()).toMatch(
        new RegExp(
          `^1 of 3 ${c.plural} failed:\\n  - .*first${c.ext.replace(/\./g, '\\.')}: `
        )
      );
      // --allow-failures turns it into a warning
      jest.clearAllMocks();
      expect(await c.many(true)).toBe(true);
      expect(level()).toBe('warn');
    });

    test('a directory that cannot be read fails the command whatever --allow-failures says', async () => {
      if (c.listing) {
        frodo.utils.readFiles.mockRejectedValue(new Error('cannot read dir'));
      } else {
        virtualDirs.set('dir', new Error('cannot read dir'));
      }

      expect(await c.many(true)).toBe(false);

      expect(lib().mock.calls).toHaveLength(0);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(printMessage).not.toHaveBeenCalled();
    });

    test('a directory without matching files is not a failure', async () => {
      putFiles({});

      expect(await c.many()).toBe(true);

      // the servers are imported with one library call for all files, also when there is none
      if (!c.listing) expect(lib().mock.calls).toHaveLength(0);
      expect(printMessage).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
    });
  });
});

describe('secretstore import', () => {
  const file = 'stores.json';
  /** A secret store with `mappings` mappings. */
  const store = (id, mappings = 0) => ({
    _id: id,
    mappings: Array.from({ length: mappings }, (_, i) => ({
      _id: `${id}-m${i}`,
    })),
  });
  const stores = (...list) =>
    JSON.stringify({
      secretstore: Object.fromEntries(list.map((s) => [s._id, s])),
    });
  const importSecretStores = () => frodo.secretStore.importSecretStores;
  /** The library calls the result callback once per secret store; the ones in `failing` failed as a whole. */
  const reportEach = (data, callback) => {
    for (const id of Object.keys(data.secretstore)) {
      if (failing.has(id)) {
        callback(
          new FrodoError(`Error importing secret store ${id}`, [
            new Error(`could not import ${id}`),
          ])
        );
      } else {
        callback(undefined, data.secretstore[id]);
      }
    }
  };

  beforeEach(() => {
    importSecretStores()
      .mockReset()
      .mockImplementation(async (data, _global, _id, _type, callback) => {
        reportEach(data, callback);
        return [];
      });
  });

  describe('-a', () => {
    test('imports every secret store and prints no summary when nothing failed', async () => {
      virtualFiles.set(file, stores(store('a'), store('b'), store('c')));

      expect(await ops.secretStore.importSecretStoresFromFile(file, true)).toBe(
        true
      );

      expect(importSecretStores().mock.calls).toHaveLength(1);
      // the global flag and no filter are handed to the library
      expect(importSecretStores().mock.calls[0][1]).toBe(true);
      expect(importSecretStores().mock.calls[0][2]).toBeUndefined();
      expect(printMessage).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
    });

    test('names the secret store that failed in one summary and fails', async () => {
      virtualFiles.set(
        file,
        stores(store('a'), store('b'), store('c'), store('d'))
      );
      failing.add('b');

      expect(await ops.secretStore.importSecretStoresFromFile(file)).toBe(
        false
      );

      expect(printError).toHaveBeenCalledTimes(1);
      expect(level()).toBe('error');
      expect(summary()).toBe(
        '1 of 4 secret stores failed:\n  - Error importing secret store b: could not import b'
      );
      expect(process.exitCode).toBeUndefined();
    });

    test('--allow-failures keeps the command successful', async () => {
      virtualFiles.set(file, stores(store('a'), store('b')));
      failing.add('a');

      expect(
        await ops.secretStore.importSecretStoresFromFile(file, false, true)
      ).toBe(true);

      expect(level()).toBe('warn');
      expect(summary()).toContain('1 of 2 secret stores failed');
    });

    test('a secret store whose mapping failed counts once, as failed, although the library also reports it as imported', async () => {
      virtualFiles.set(
        file,
        stores(store('a', 2), store('b', 2), store('c', 0), store('d', 1))
      );
      importSecretStores()
        .mockReset()
        .mockImplementation(async (data, _global, _id, _type, callback) => {
          // a: imported with both mappings
          callback(undefined, { ...data.secretstore.a });
          // b: a mapping failed, the library reports the error and then the store with the mappings done so far
          callback(
            new FrodoError('Error importing secret store mapping b-m1', [
              new Error('could not import b-m1'),
            ])
          );
          callback(undefined, { _id: 'b', mappings: [{ _id: 'b-m0' }] });
          // c: no mappings, imported
          callback(undefined, { _id: 'c', mappings: [] });
          // d: the whole store failed
          callback(
            new FrodoError('Error importing secret store d', [
              new Error('boom'),
            ])
          );
          return [];
        });

      expect(await ops.secretStore.importSecretStoresFromFile(file)).toBe(
        false
      );

      expect(summary()).toBe(
        '2 of 4 secret stores failed:\n  - Error importing secret store mapping b-m1: could not import b-m1\n  - Error importing secret store d: boom'
      );
    });

    test('a file that cannot be parsed fails the command whatever --allow-failures says', async () => {
      virtualFiles.set(file, '{ not json');

      expect(
        await ops.secretStore.importSecretStoresFromFile(file, false, true)
      ).toBe(false);

      expect(importSecretStores().mock.calls).toHaveLength(0);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(printMessage).not.toHaveBeenCalled();
    });

    test('a file that is not a secret store export fails the command whatever --allow-failures says', async () => {
      virtualFiles.set(file, '{}');
      importSecretStores()
        .mockReset()
        .mockRejectedValue(new TypeError('no secret stores'));

      expect(
        await ops.secretStore.importSecretStoresFromFile(file, false, true)
      ).toBe(false);
      expect(printMessage).not.toHaveBeenCalled();
    });
  });

  describe('-A', () => {
    const first = 'first.secretstore.json';
    const second = 'second.secretstore.json';

    test('imports the secret stores of every file', async () => {
      virtualDirs.set('dir', [first, second, 'unrelated.txt']);
      virtualFiles.set(first, stores(store('a')));
      virtualFiles.set(second, stores(store('b')));

      expect(await ops.secretStore.importSecretStoresFromFiles()).toBe(true);

      expect(importSecretStores().mock.calls).toHaveLength(2);
      expect(printMessage).not.toHaveBeenCalled();
    });

    test('a failing secret store does not keep the other files from being imported and is named in one summary', async () => {
      virtualDirs.set('dir', [first, second]);
      virtualFiles.set(first, stores(store('a'), store('b')));
      virtualFiles.set(second, stores(store('c'), store('d')));
      failing.add('c');

      expect(await ops.secretStore.importSecretStoresFromFiles()).toBe(false);

      expect(importSecretStores().mock.calls).toHaveLength(2);
      expect(summary()).toBe(
        '1 of 4 secret stores failed:\n  - Error importing secret store c: could not import c'
      );
      jest.clearAllMocks();
      expect(
        await ops.secretStore.importSecretStoresFromFiles(false, true)
      ).toBe(true);
      expect(level()).toBe('warn');
    });

    test('a file that cannot be parsed is a named failure and the others are still imported', async () => {
      virtualDirs.set('dir', [first, second]);
      virtualFiles.set(first, '{ not json');
      virtualFiles.set(second, stores(store('b')));

      expect(await ops.secretStore.importSecretStoresFromFiles()).toBe(false);

      expect(importSecretStores().mock.calls).toHaveLength(1);
      expect(summary()).toMatch(
        /^1 of 2 secret stores failed:\n {2}- first\.secretstore\.json: /
      );
    });

    test('a directory that cannot be read fails the command whatever --allow-failures says', async () => {
      virtualDirs.set('dir', new Error('cannot read dir'));

      expect(
        await ops.secretStore.importSecretStoresFromFiles(false, true)
      ).toBe(false);
      expect(printMessage).not.toHaveBeenCalled();
    });
  });

  describe('one secret store', () => {
    test('a failure reported by the library fails the command (it used to print the error and succeed)', async () => {
      virtualFiles.set(file, stores(store('a'), store('b')));
      failing.add('a');

      expect(
        await ops.secretStore.importSecretStoreFromFile('a', undefined, file)
      ).toBe(false);

      expect(printError).toHaveBeenCalledTimes(1);
      expect(printMessage).not.toHaveBeenCalled();
      // the filter is handed to the library
      expect(importSecretStores().mock.calls[0][2]).toBe('a');
    });

    test('succeeds when the library reports no failure', async () => {
      virtualFiles.set(file, stores(store('a')));

      expect(
        await ops.secretStore.importSecretStoreFromFile('a', undefined, file)
      ).toBe(true);
      expect(printError).not.toHaveBeenCalled();
    });
  });

  describe('first secret store', () => {
    test('hands the library the first secret store only', async () => {
      virtualFiles.set(file, stores(store('a'), store('b'), store('c')));

      expect(await ops.secretStore.importFirstSecretStoreFromFile(file)).toBe(
        true
      );

      const data = importSecretStores().mock.calls[0][0];
      expect(Object.keys(data.secretstore)).toEqual(['a']);
    });

    test('a failure reported by the library fails the command', async () => {
      virtualFiles.set(file, stores(store('a'), store('b')));
      failing.add('a');

      expect(await ops.secretStore.importFirstSecretStoreFromFile(file)).toBe(
        false
      );
      expect(printError).toHaveBeenCalledTimes(1);
    });
  });
});

describe('iga workflow import', () => {
  const importWorkflows = () => frodo.cloud.iga.workflow.importWorkflows;
  /** An export of workflows with the given ids. */
  const workflows = (ids) =>
    JSON.stringify({
      workflow: Object.fromEntries(
        ids.map((id) => [id, { published: { id, mutable: true, steps: [] } }])
      ),
    });

  beforeEach(() => {
    // the library calls the result callback once per workflow; the ones in `failing` failed
    importWorkflows()
      .mockReset()
      .mockImplementation(async (_id, data, _options, callback) => {
        for (const id of Object.keys(data.workflow)) {
          if (failing.has(id)) {
            callback(
              new FrodoError(`Error importing published workflow ${id}`, [
                new Error(`could not import ${id}`),
              ])
            );
          } else {
            callback(undefined, { id });
          }
        }
        return [];
      });
  });

  describe('-a', () => {
    const file = 'workflows.json';

    test('imports every workflow and prints no summary when nothing failed', async () => {
      virtualFiles.set(file, workflows(IDS));

      expect(await ops.workflow.importWorkflowsFromFile(file)).toBe(true);

      expect(importWorkflows().mock.calls).toHaveLength(1);
      expect(printMessage).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
    });

    test('names the workflow that failed in one summary and fails, the others were imported', async () => {
      virtualFiles.set(file, workflows(IDS));
      failing.add('b');

      expect(await ops.workflow.importWorkflowsFromFile(file)).toBe(false);

      expect(level()).toBe('error');
      expect(summary()).toBe(
        '1 of 4 workflows failed:\n  - Error importing published workflow b: could not import b'
      );
      // the library prints nothing itself, the run does
      expect(process.exitCode).toBeUndefined();
    });

    test('--allow-failures keeps the command successful', async () => {
      virtualFiles.set(file, workflows(IDS));
      failing.add('b');

      expect(
        await ops.workflow.importWorkflowsFromFile(file, undefined, true)
      ).toBe(true);

      expect(level()).toBe('warn');
      expect(summary()).toContain('1 of 4 workflows failed');
    });

    test('hands the import options to the library', async () => {
      virtualFiles.set(file, workflows(['a']));

      await ops.workflow.importWorkflowsFromFile(file, { deps: false });

      expect(importWorkflows().mock.calls[0][2]).toEqual({ deps: false });
    });

    test('a file that cannot be parsed fails the command whatever --allow-failures says', async () => {
      virtualFiles.set(file, '{ not json');

      expect(
        await ops.workflow.importWorkflowsFromFile(file, undefined, true)
      ).toBe(false);

      expect(importWorkflows().mock.calls).toHaveLength(0);
      expect(printMessage).not.toHaveBeenCalled();
    });

    test('a library failure that is not a workflow (the workflows of the tenant cannot be read) fails whatever --allow-failures says', async () => {
      virtualFiles.set(file, workflows(['a']));
      importWorkflows()
        .mockReset()
        .mockRejectedValue(new Error('cannot read workflows'));

      expect(
        await ops.workflow.importWorkflowsFromFile(file, undefined, true)
      ).toBe(false);
      expect(printMessage).not.toHaveBeenCalled();
    });
  });

  describe('-A', () => {
    const first = 'first.workflow.json';
    const second = 'second.workflow.json';

    test('imports the workflows of every file', async () => {
      virtualDirs.set('dir', [first, second, 'unrelated.txt']);
      virtualFiles.set(first, workflows(['a', 'b']));
      virtualFiles.set(second, workflows(['c', 'd']));

      expect(await ops.workflow.importWorkflowsFromFiles()).toBe(true);

      expect(importWorkflows().mock.calls).toHaveLength(2);
      expect(printMessage).not.toHaveBeenCalled();
    });

    test('a failing workflow does not keep the other files from being imported and is named in one summary (it used to be ignored)', async () => {
      virtualDirs.set('dir', [first, second]);
      virtualFiles.set(first, workflows(['a', 'b']));
      virtualFiles.set(second, workflows(['c', 'd']));
      failing.add('a');

      expect(await ops.workflow.importWorkflowsFromFiles()).toBe(false);

      expect(importWorkflows().mock.calls).toHaveLength(2);
      expect(summary()).toBe(
        '1 of 4 workflows failed:\n  - Error importing published workflow a: could not import a'
      );
      jest.clearAllMocks();
      expect(await ops.workflow.importWorkflowsFromFiles(undefined, true)).toBe(
        true
      );
      expect(level()).toBe('warn');
    });

    test('a file that cannot be parsed is a named failure and the others are still imported', async () => {
      virtualDirs.set('dir', [first, second]);
      virtualFiles.set(first, '{ not json');
      virtualFiles.set(second, workflows(['c']));

      expect(await ops.workflow.importWorkflowsFromFiles()).toBe(false);

      expect(importWorkflows().mock.calls).toHaveLength(1);
      expect(summary()).toMatch(
        /^1 of 2 workflows failed:\n {2}- first\.workflow\.json: /
      );
    });

    test('a directory that cannot be read fails the command whatever --allow-failures says', async () => {
      virtualDirs.set('dir', new Error('cannot read dir'));

      expect(await ops.workflow.importWorkflowsFromFiles(undefined, true)).toBe(
        false
      );
      expect(printMessage).not.toHaveBeenCalled();
    });
  });
});
