import fs from 'node:fs';
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
 * Decision record 0040 for the imports of `realm import`, `role import`,
 * `saml import`, `saml cot import`, `idp import`, `app import` and
 * `oauth client import`.
 *
 * The library tries every item of a parsed import file and throws ONE combined
 * error with one nested error per item that failed. The commands hand it each
 * file and count the items:
 *
 * -a (all items of ONE file) and -A (every file of a directory): an item that
 * cannot be imported does not stop the others, one summary names it, and the
 * command fails, unless --allow-failures was given. A file of -A that cannot be
 * read or parsed is a failed item named by the file. A file or directory that
 * the command line names and that cannot be read fails the command whatever the
 * flag says. Nothing to import is not a failure.
 *
 * A single item (-i, -n, or the first of a file): never swallows a failure.
 *
 * The real import graph of the ops modules pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the library is a deep
 * stub and every relative import of the modules under test is a set of spies
 * (OperationRun, ErrorCause, ImportItems and the modules themselves stay real).
 * The file system is a set of virtual files.
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

const OPTIONS = { deps: true };

/**
 * `data(ids)` is the parsed content of an import file with these items, `lib`
 * the library function that imports a file, `pre` the arguments between the
 * file and `allowFailures` (`-a`) and before it (`-A`), `ext` the end of the
 * names of the files of `-A`, `single` a function that imports one item.
 */
const CASES = [
  {
    name: 'realm import',
    file: 'src/ops/RealmOps.ts',
    all: 'importRealmsFromFile',
    separate: 'importRealmsFromFiles',
    plural: 'realms',
    ext: '.realm.json',
    pre: [],
    data: (ids) => ({
      realm: Object.fromEntries(ids.map((id) => [id, { _id: id, name: id }])),
    }),
    lib: () => frodo.realm.importRealms,
    single: {
      fn: 'importRealmFromFile',
      args: ['a', undefined, 'one.realm.json'],
      lib: () => frodo.realm.importRealms,
    },
  },
  {
    name: 'role import',
    file: 'src/ops/InternalRoleOps.ts',
    all: 'importInternalRolesFromFile',
    separate: 'importInternalRolesFromFiles',
    plural: 'internal roles',
    ext: '.internalrole.json',
    pre: [],
    emptyMessage: ['No internal role files found to import.', 'warn'],
    data: (ids) => ({
      internalRole: Object.fromEntries(
        ids.map((id) => [id, { _id: id, name: id }])
      ),
    }),
    lib: () => frodo.role.importInternalRoles,
    single: {
      fn: 'importInternalRoleFromFile',
      args: ['a', undefined, 'one.internalrole.json'],
      lib: () => frodo.role.importInternalRole,
    },
  },
  {
    name: 'saml import',
    file: 'src/ops/Saml2Ops.ts',
    all: 'importSaml2ProvidersFromFile',
    separate: 'importSaml2ProvidersFromFiles',
    plural: 'SAML providers',
    ext: '.saml.json',
    pre: [OPTIONS],
    data: (ids) => ({
      saml: {
        hosted: Object.fromEntries(ids.map((id) => [id, { entityId: id }])),
        remote: {},
        metadata: {},
        cot: {},
      },
    }),
    lib: () => frodo.saml2.entityProvider.importSaml2Providers,
    single: {
      fn: 'importSaml2ProviderFromFile',
      args: ['a', 'one.saml.json', OPTIONS],
      lib: () => frodo.saml2.entityProvider.importSaml2Provider,
    },
  },
  {
    name: 'saml cot import',
    file: 'src/ops/CirclesOfTrustOps.ts',
    all: 'importCirclesOfTrustFromFile',
    separate: 'importCirclesOfTrustFromFiles',
    plural: 'trust circles',
    ext: '.cot.saml.json',
    pre: [],
    data: (ids) => ({
      saml: { cot: Object.fromEntries(ids.map((id) => [id, { _id: id }])) },
    }),
    lib: () => frodo.saml2.circlesOfTrust.importCirclesOfTrust,
    single: {
      fn: 'importCircleOfTrustFromFile',
      args: ['a', 'one.cot.saml.json'],
      lib: () => frodo.saml2.circlesOfTrust.importCircleOfTrust,
    },
  },
  {
    name: 'idp import',
    file: 'src/ops/IdpOps.ts',
    all: 'importSocialIdentityProvidersFromFile',
    separate: 'importSocialIdentityProvidersFromFiles',
    plural: 'identity providers',
    ext: '.idp.json',
    pre: [OPTIONS],
    data: (ids) => ({
      idp: Object.fromEntries(ids.map((id) => [id, { _id: id }])),
    }),
    lib: () => frodo.oauth2oidc.external.importSocialIdentityProviders,
    single: {
      fn: 'importSocialIdentityProviderFromFile',
      args: ['a', 'one.idp.json', OPTIONS],
      lib: () => frodo.oauth2oidc.external.importSocialIdentityProvider,
    },
  },
  {
    name: 'app import',
    file: 'src/ops/ApplicationOps.ts',
    all: 'importApplicationsFromFile',
    separate: 'importApplicationsFromFiles',
    plural: 'applications',
    ext: '.application.json',
    pre: [OPTIONS],
    data: (ids) => ({
      managedApplication: Object.fromEntries(
        ids.map((id) => [id, { _id: id, name: id }])
      ),
    }),
    lib: () => frodo.app.importApplications,
    single: {
      fn: 'importApplicationFromFile',
      args: ['a', undefined, 'one.application.json', OPTIONS],
      lib: () => frodo.app.importApplication,
    },
  },
  {
    name: 'oauth client import',
    file: 'src/ops/OAuth2ClientOps.ts',
    all: 'importOAuth2ClientsFromFile',
    separate: 'importOAuth2ClientsFromFiles',
    plural: 'clients',
    ext: '.oauth2.app.json',
    pre: [OPTIONS],
    data: (ids) => ({
      application: Object.fromEntries(ids.map((id) => [id, { _id: id }])),
    }),
    lib: () => frodo.oauth2oidc.client.importOAuth2Clients,
    single: {
      fn: 'importOAuth2ClientFromFile',
      args: ['a', 'one.oauth2.app.json', OPTIONS],
      lib: () => frodo.oauth2oidc.client.importOAuth2Client,
    },
  },
];

// every relative import of the modules under test becomes spies, except the
// run tracker, the error cause, the import helper and the modules under test
const modulesUnderTest = new Set(
  CASES.map((c) => path.resolve(root, c.file).replace(/\.ts$/, ''))
);
const realModules = [
  '/utils/OperationRun',
  '/utils/ErrorCause',
  '/utils/ImportItems',
];
const mocked = new Map();
for (const { file } of CASES) {
  const source = fs.readFileSync(path.resolve(root, file), 'utf8');
  const importer = path.dirname(path.resolve(root, file));
  for (const [, clause, from] of source.matchAll(
    /^import (?!type )([^;]*?) from '(\.[^']+)';/gms
  )) {
    const target = path.resolve(importer, from).replace(/\.(js|ts)$/, '');
    if (
      modulesUnderTest.has(target) ||
      realModules.some((real) => target.endsWith(real))
    ) {
      continue;
    }
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
// the real modules print and show progress through these
const consoleTarget = path.resolve(root, 'src/utils/Console');
mocked.set(
  consoleTarget,
  new Set([
    ...(mocked.get(consoleTarget) ?? []),
    'printError',
    'printMessage',
    'createProgressIndicator',
    'stopProgressIndicator',
    'updateProgressIndicator',
  ])
);
const spies = new Map();
for (const [target, names] of mocked) {
  const exports = {};
  for (const name of names) exports[name] = jest.fn();
  // the colour theme only decorates text
  if (target.endsWith('/utils/ColorTheme')) {
    exports.default = new Proxy({}, { get: () => (text) => text });
  }
  spies.set(target, exports);
  jest.unstable_mockModule(target, () => exports);
}
const { printError, printMessage } = spies.get(consoleTarget);

const modules = {};
for (const { file } of CASES) {
  modules[file] = await import(path.resolve(root, file));
}

const summary = () =>
  printMessage.mock.calls
    .map(([text]) => text)
    .filter((text) => /\bfailed:/.test(text))
    .join('\n');
const summaryLevel = () =>
  printMessage.mock.calls.find(([text]) => /\bfailed:/.test(text))?.[1];

/** An error of the library for one item that could not be imported. */
const itemError = (id) =>
  new FrodoError(`Error importing item ${id}`, [
    new Error(`HTTP 500 for ${id}`),
  ]);
/** The one combined error of the library, with one nested error per item. */
const combined = (...ids) =>
  new FrodoError('Error importing items', ids.map(itemError));
const enoent = (file) =>
  Object.assign(
    new Error(`ENOENT: no such file or directory, open '${file}'`),
    {
      code: 'ENOENT',
    }
  );

/** The virtual file system: what `readFileSync` and `readdirSync` answer. */
let files;
let directory;
let readSpy;
let dirSpy;

let exitCodeBefore;
beforeEach(() => {
  jest.clearAllMocks();
  exitCodeBefore = process.exitCode;
  process.exitCode = undefined;
  files = new Map();
  directory = [];
  readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation((file) => {
    const content = files.get(String(file));
    if (content === undefined) throw enoent(file);
    if (content instanceof Error) throw content;
    return content;
  });
  dirSpy = jest.spyOn(fs, 'readdirSync').mockImplementation(() => {
    if (directory instanceof Error) throw directory;
    return directory;
  });
  const utils = frodo.utils;
  utils.getFilePath.mockReset().mockImplementation((name) => `/in/${name}`);
  utils.getWorkingDirectory.mockReset().mockReturnValue('/in');
});

afterEach(() => {
  readSpy.mockRestore();
  dirSpy.mockRestore();
  process.exitCode = exitCodeBefore;
});

/** Puts `content` (an object, a string or an error) into the file `name`. */
function putFile(name, content) {
  files.set(
    `/in/${name}`,
    typeof content === 'string' || content instanceof Error
      ? content
      : JSON.stringify(content)
  );
}

describe.each(CASES)('$name -a (every item of one file)', (c) => {
  const run = (allowFailures, file = 'all.json') =>
    modules[c.file][c.all](file, ...c.pre, allowFailures);

  beforeEach(() => {
    putFile('all.json', c.data(['a', 'b', 'c']));
    c.lib().mockReset().mockResolvedValue([]);
  });

  test('imports the file and prints no summary when nothing failed', async () => {
    expect(await run()).toBe(true);

    expect(c.lib().mock.calls).toHaveLength(1);
    expect(c.lib().mock.calls[0][0]).toEqual(c.data(['a', 'b', 'c']));
    // the import options reach the library
    if (c.pre.length) expect(c.lib().mock.calls[0][1]).toEqual(OPTIONS);
    expect(printMessage).not.toHaveBeenCalledWith(
      expect.stringMatching(/failed:/),
      expect.anything()
    );
    expect(printError).not.toHaveBeenCalled();
    // the ops function leaves the exit code to its caller (record 0033)
    expect(process.exitCode).toBeUndefined();
  });

  test('names the item that failed in one summary and fails', async () => {
    c.lib().mockRejectedValue(combined('b'));

    expect(await run()).toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaryLevel()).toBe('error');
    expect(summary()).toBe(
      `1 of 3 ${c.plural} failed:\n  - Error importing item b: HTTP 500 for b`
    );
  });

  test('names every item that failed', async () => {
    c.lib().mockRejectedValue(combined('a', 'c'));

    expect(await run()).toBe(false);

    expect(summary()).toBe(
      `2 of 3 ${c.plural} failed:\n  - Error importing item a: HTTP 500 for a\n  - Error importing item c: HTTP 500 for c`
    );
  });

  test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
    c.lib().mockRejectedValue(combined('b'));

    expect(await run(true)).toBe(true);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaryLevel()).toBe('warn');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('a file that cannot be read fails whatever --allow-failures says', async () => {
    putFile('all.json', enoent('/in/all.json'));

    expect(await run(true)).toBe(false);

    expect(c.lib().mock.calls).toHaveLength(0);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe('');
  });

  test('a file that is not JSON fails whatever --allow-failures says', async () => {
    putFile('all.json', 'this is not json');

    expect(await run(true)).toBe(false);

    expect(c.lib().mock.calls).toHaveLength(0);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe('');
  });

  test('a file that holds no import data is one failure named by the file', async () => {
    putFile('all.json', {});

    expect(await run()).toBe(false);

    expect(c.lib().mock.calls).toHaveLength(0);
    expect(summary()).toMatch(
      new RegExp(
        `^1 of 1 ${c.plural.replace(/s$/, 's?')} failed:\\n {2}- all\\.json: .+`
      )
    );
  });

  test('an error of the library that names no item is one failure named by the file', async () => {
    c.lib().mockRejectedValue(new Error('boom'));

    expect(await run()).toBe(false);

    expect(summary()).toMatch(
      new RegExp(
        `^1 of \\d ${c.plural.replace(/s$/, 's?')} failed:\\n {2}- all\\.json: boom$`
      )
    );
  });
});

describe.each(CASES)('$name -A (every file of a directory)', (c) => {
  const names = ['a', 'b', 'c'].map((id) => `${id}${c.ext}`);
  const run = (allowFailures) =>
    modules[c.file][c.separate](...c.pre, allowFailures);

  beforeEach(() => {
    directory = [...names];
    for (const id of ['a', 'b', 'c']) putFile(`${id}${c.ext}`, c.data([id]));
    c.lib().mockReset().mockResolvedValue([]);
  });

  test('imports every file and prints no summary when nothing failed', async () => {
    expect(await run()).toBe(true);

    expect(c.lib().mock.calls).toHaveLength(3);
    if (c.pre.length) {
      for (const call of c.lib().mock.calls) expect(call[1]).toEqual(OPTIONS);
    }
    expect(printMessage).not.toHaveBeenCalledWith(
      expect.stringMatching(/failed:/),
      expect.anything()
    );
    expect(printError).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  test('imports the other files after one failed, names the item in one summary and fails', async () => {
    c.lib().mockImplementation(async (data) => {
      if (JSON.stringify(data) === JSON.stringify(c.data(['b']))) {
        throw combined('b');
      }
      return [];
    });

    expect(await run()).toBe(false);

    expect(c.lib().mock.calls).toHaveLength(3);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaryLevel()).toBe('error');
    expect(summary()).toBe(
      `1 of 3 ${c.plural} failed:\n  - Error importing item b: HTTP 500 for b`
    );
  });

  test('a file that is not JSON is a failure named by the file and the others are still imported', async () => {
    putFile(`b${c.ext}`, 'this is not json');

    expect(await run()).toBe(false);

    expect(c.lib().mock.calls).toHaveLength(2);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toMatch(
      new RegExp(
        `^1 of 3 ${c.plural.replace(/s$/, 's?')} failed:\\n {2}- b${c.ext.replace(/\./g, '\\.')}: .+`
      )
    );
  });

  test('a file that holds no import data is a failure named by the file', async () => {
    putFile(`c${c.ext}`, {});

    expect(await run()).toBe(false);

    expect(c.lib().mock.calls).toHaveLength(2);
    expect(summary()).toMatch(
      new RegExp(`\\n {2}- c${c.ext.replace(/\./g, '\\.')}: .+`)
    );
  });

  test('counts the items of a file that holds several', async () => {
    putFile(`a${c.ext}`, c.data(['a1', 'a2']));
    c.lib().mockImplementation(async (data) => {
      if (JSON.stringify(data) === JSON.stringify(c.data(['a1', 'a2']))) {
        throw combined('a2');
      }
      return [];
    });

    expect(await run()).toBe(false);

    expect(summary()).toBe(
      `1 of 4 ${c.plural} failed:\n  - Error importing item a2: HTTP 500 for a2`
    );
  });

  test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
    c.lib().mockRejectedValue(combined('b'));

    expect(await run(true)).toBe(true);

    expect(printError).toHaveBeenCalledTimes(3);
    expect(summaryLevel()).toBe('warn');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('a directory that cannot be read fails whatever --allow-failures says', async () => {
    directory = enoent('/in');

    expect(await run(true)).toBe(false);

    expect(c.lib().mock.calls).toHaveLength(0);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe('');
  });

  test('a directory without import files is nothing to import, not a failure', async () => {
    directory = ['notes.txt'];

    expect(await run()).toBe(true);

    expect(c.lib().mock.calls).toHaveLength(0);
    expect(printError).not.toHaveBeenCalled();
    expect(summary()).toBe('');
    if (c.emptyMessage) {
      expect(printMessage).toHaveBeenCalledWith(...c.emptyMessage);
    }
  });

  test('only the files with the right ending are imported', async () => {
    directory = [...names, 'notes.txt', 'other.json'];

    expect(await run()).toBe(true);

    expect(c.lib().mock.calls).toHaveLength(3);
  });
});

describe.each(CASES)('$name, a single item', (c) => {
  const run = () => modules[c.file][c.single.fn](...c.single.args);

  beforeEach(() => {
    putFile(
      c.single.args.find(
        (arg) => typeof arg === 'string' && /\.json$/.test(arg)
      ),
      c.data(['a'])
    );
    c.single.lib().mockReset().mockResolvedValue([]);
  });

  test('succeeds when the library imports it', async () => {
    expect(await run()).toBe(true);

    expect(printError).not.toHaveBeenCalled();
  });

  test('never swallows a failure of the library', async () => {
    c.single.lib().mockRejectedValue(new Error('could not import'));

    expect(await run()).toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
  });

  test('never swallows a file that cannot be read', async () => {
    files.clear();

    expect(await run()).toBe(false);

    expect(c.single.lib().mock.calls).toHaveLength(0);
    expect(printError).toHaveBeenCalledTimes(1);
  });
});
