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
 * Decision record 0040 for the imports of the IDM family and of the whole
 * configuration: `config import -a` and `-A`, `idm import -a` and `-A` (and
 * `idm schema object import -D`, which imports the same directory),
 * `idm remote-proxy import -a` and `-A`, `mapping import -a` and `-A`.
 * When one item cannot be imported, the others still are, one summary names the
 * failed one, and the command fails, unless --allow-failures was given. A
 * failure to read what the command line names (a missing or unparsable file, an
 * unreadable directory) fails the command whatever the flag says. A file of a
 * directory that cannot be parsed is one failed item and the others are still
 * imported. Nothing to import is not a failure (record 0041).
 * The library reports the config entities and the parts of the configuration to
 * the result callback of the run; for the mappings and the remote proxies it
 * throws one combined error that names the failed ones. The remote proxies have
 * a gate: if the library refuses any proxy it imports nothing, which is a
 * failure the other proxies depend on, so `--allow-failures` does not apply.
 *
 * The real import graph of the ops modules pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the library is a deep
 * stub and every relative import of the modules under test is a set of spies
 * (OperationRun and the modules themselves stay real).
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

const FILES = [
  'src/ops/IdmOps.ts',
  'src/ops/ConfigOps.ts',
  'src/ops/RemoteProxyOps.ts',
  'src/ops/MappingOps.ts',
];

// every relative import of the modules under test becomes spies, except the
// run tracker and the modules under test themselves
const modulesUnderTest = new Set(
  FILES.map((file) => path.resolve(root, file).replace(/\.ts$/, ''))
);
const realModules = new Set(['/utils/OperationRun', '/utils/ErrorCause']);
const mocked = new Map();
for (const file of FILES) {
  const source = fs.readFileSync(path.resolve(root, file), 'utf8');
  const importer = path.dirname(path.resolve(root, file));
  for (const [, clause, from] of source.matchAll(
    /^import (?!type )([^;]*?) from '(\.[^']+)';/gms
  )) {
    const target = path.resolve(importer, from).replace(/\.(js|ts)$/, '');
    if (
      modulesUnderTest.has(target) ||
      [...realModules].some((real) => target.endsWith(real))
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
// the real OperationRun prints through these
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
  spies.set(target, exports);
  jest.unstable_mockModule(target, () => exports);
}
const { printError, printMessage, stopProgressIndicator } =
  spies.get(consoleTarget);
const config = spies.get(path.resolve(root, 'src/utils/Config'));

// the file system: what the commands read is in `files`
const files = new Map();
let directoryListing = [];
const enoent = (name) =>
  Object.assign(
    new Error(`ENOENT: no such file or directory, open '${name}'`),
    {
      code: 'ENOENT',
    }
  );
jest.unstable_mockModule('fs', () => ({
  default: {
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(() => {
      if (directoryListing === null) throw enoent('/work');
      return directoryListing;
    }),
    rmdirSync: jest.fn(),
    readFileSync: jest.fn((name) => {
      // the single-entity imports read path.resolve(cwd, file)
      const key = files.has(String(name))
        ? String(name)
        : path.relative(process.cwd(), String(name));
      if (!files.has(key)) throw enoent(name);
      return files.get(key);
    }),
    writeFileSync: jest.fn(),
  },
}));

const modules = {};
for (const file of FILES) {
  modules[file] = await import(path.resolve(root, file));
}
const { importAllConfigEntitiesFromFile, importAllConfigEntitiesFromFiles } =
  modules['src/ops/IdmOps.ts'];
const {
  importEverythingFromFile,
  importEverythingFromFiles,
  importEntityfromFile,
} = modules['src/ops/ConfigOps.ts'];
const { importRemoteProxiesFromFile, importRemoteProxiesFromFiles } =
  modules['src/ops/RemoteProxyOps.ts'];
const { importMappingsFromFile, importMappingsFromFiles } =
  modules['src/ops/MappingOps.ts'];

const summary = () =>
  printMessage.mock.calls
    .map(([text]) => text)
    .filter((text) => /\bfailed[:,]/.test(text))
    .join('\n');
const summaryLevel = () =>
  printMessage.mock.calls.find(([text]) => /\bfailed[:,]/.test(text))?.[1];

let exitCodeBefore;
beforeEach(() => {
  jest.clearAllMocks();
  exitCodeBefore = process.exitCode;
  process.exitCode = undefined;
  files.clear();
  directoryListing = [];
  frodo.utils.getFilePath.mockReset().mockImplementation((file) => file);
  frodo.utils.getWorkingDirectory.mockReset().mockReturnValue('/work');
  frodo.utils.readFiles.mockReset().mockResolvedValue([]);
  // no remote proxy carries a secret of another tenant
  frodo.idm.remoteProxy.getTenantBoundSecrets.mockReset().mockReturnValue([]);
});
afterEach(() => {
  process.exitCode = exitCodeBefore;
});

const IDS = ['a', 'b', 'c', 'd'];
/** The error the library gives for one failed item: its message names the item, the cause is nested. */
const itemError = (message, cause = 'HTTP 500') =>
  new FrodoError(message, [new Error(cause)]);

/**
 * `arrange(mode)` sets up the library stubs and the files. The modes are `clean`,
 * `oneFails` (item b cannot be imported), `readFails` (what the command line
 * names cannot be read) and `empty` (there is nothing to import).
 */
const CASES = [
  {
    name: 'idm import -a',
    run: (allowFailures) =>
      importAllConfigEntitiesFromFile(
        'all.idm.json',
        undefined,
        false,
        allowFailures
      ),
    oneFails:
      '1 of 4 config entities failed:\n  - Error updating config entity b: HTTP 500',
    arrange: (mode) => {
      if (mode !== 'readFails') {
        files.set(
          'all.idm.json',
          JSON.stringify({
            idm: Object.fromEntries(
              (mode === 'empty' ? [] : IDS).map((id) => [id, { _id: id }])
            ),
          })
        );
      }
      frodo.idm.config.importConfigEntities
        .mockReset()
        .mockImplementation(async (data, _entityId, _options, callback) => {
          for (const id of Object.keys(data.idm)) {
            if (mode === 'oneFails' && id === 'b') {
              callback(itemError(`Error updating config entity ${id}`));
            } else {
              callback(undefined, data.idm[id]);
            }
          }
          return [];
        });
    },
  },
  {
    name: 'idm import -A (and idm schema object import -D)',
    run: (allowFailures) =>
      importAllConfigEntitiesFromFiles(undefined, false, allowFailures),
    oneFails:
      '1 of 4 config entities failed:\n  - Error updating config entity b: HTTP 500',
    arrange: (mode) => {
      frodo.utils.readFiles.mockReset().mockImplementation(async () => {
        if (mode === 'readFails') throw enoent('/work');
        return (mode === 'empty' ? [] : IDS).map((id) => ({
          path: `/work/${id}.idm.json`,
          content: JSON.stringify({ idm: { [id]: { _id: id } } }),
        }));
      });
      frodo.idm.config.importConfigEntities
        .mockReset()
        .mockImplementation(async (data, _entityId, _options, callback) => {
          for (const id of Object.keys(data.idm)) {
            if (mode === 'oneFails' && id === 'b') {
              callback(itemError(`Error updating config entity ${id}`));
            } else {
              callback(undefined, data.idm[id]);
            }
          }
          return [];
        });
    },
  },
  {
    name: 'config import -a',
    run: (allowFailures) =>
      importEverythingFromFile('all.config.json', undefined, allowFailures),
    oneFails: '1 of 3 items failed:\n  - Error Importing Journeys: HTTP 500',
    arrange: (mode) => arrangeFullImport(mode),
  },
  {
    name: 'config import -A',
    run: (allowFailures) => importEverythingFromFiles(undefined, allowFailures),
    oneFails: '1 of 3 items failed:\n  - Error Importing Journeys: HTTP 500',
    arrange: (mode) => arrangeFullImport(mode),
  },
  {
    name: 'idm remote-proxy import -a',
    run: (allowFailures) =>
      importRemoteProxiesFromFile(
        'proxies.remoteproxy.idm.json',
        allowFailures
      ),
    oneFails:
      '1 of 3 remote proxies failed:\n  - Error updating remote proxy b: HTTP 500',
    arrange: (mode) => {
      if (mode !== 'readFails') {
        files.set(
          'proxies.remoteproxy.idm.json',
          JSON.stringify({
            remoteProxy: Object.fromEntries(
              ['a', 'b', 'c'].map((id) => [id, { _id: `remoteProxy/${id}` }])
            ),
          })
        );
      }
      arrangeProxyLibrary(mode);
    },
  },
  {
    name: 'idm remote-proxy import -A',
    run: (allowFailures) => importRemoteProxiesFromFiles(allowFailures),
    oneFails:
      '1 of 3 remote proxies failed:\n  - Error updating remote proxy b: HTTP 500',
    arrange: (mode) => {
      directoryListing =
        mode === 'readFails'
          ? null
          : mode === 'empty'
            ? []
            : [
                'a.remoteproxy.idm.json',
                'b.remoteproxy.idm.json',
                'c.remoteproxy.idm.json',
                'notes.txt',
              ];
      for (const id of ['a', 'b', 'c']) {
        files.set(
          `/work/${id}.remoteproxy.idm.json`,
          JSON.stringify({
            remoteProxy: { [id]: { _id: `remoteProxy/${id}` } },
          })
        );
      }
      arrangeProxyLibrary(mode);
    },
  },
  {
    name: 'mapping import -a',
    run: (allowFailures) =>
      importMappingsFromFile('mappings.json', undefined, allowFailures),
    oneFails:
      '1 of 4 mappings failed:\n  - Error updating mapping mapping/b: HTTP 500',
    arrange: (mode) => {
      if (mode !== 'readFails') {
        files.set(
          'mappings.json',
          JSON.stringify({
            mapping:
              mode === 'empty'
                ? {}
                : Object.fromEntries(
                    ['a', 'b', 'c'].map((id) => [
                      `mapping/${id}`,
                      { _id: `mapping/${id}` },
                    ])
                  ),
            sync: { mappings: mode === 'empty' ? [] : [{ _id: 'sync/d' }] },
          })
        );
      }
      arrangeMappingLibrary(mode);
    },
  },
  {
    name: 'mapping import -A',
    run: (allowFailures) => importMappingsFromFiles(undefined, allowFailures),
    oneFails:
      '1 of 4 mappings failed:\n  - Error updating mapping mapping/b: HTTP 500',
    arrange: (mode) => {
      frodo.utils.readFiles.mockReset().mockImplementation(async () => {
        if (mode === 'readFails') throw enoent('/work');
        if (mode === 'empty') return [];
        return [
          ...['a', 'b', 'c'].map((id) => ({
            path: `/work/${id}.mapping.json`,
            content: JSON.stringify({
              mapping: { [`mapping/${id}`]: { _id: `mapping/${id}` } },
            }),
          })),
          {
            path: '/work/sync.idm.json',
            content: JSON.stringify({
              idm: { sync: { mappings: [{ _id: 'sync/d', name: 'd' }] } },
            }),
          },
        ];
      });
      arrangeMappingLibrary(mode);
    },
  },
];

/** The parts of a full import: the library reports three, one of them failed in the `oneFails` mode. */
function arrangeFullImport(mode) {
  config.getFullExportConfig.mockReset().mockImplementation(async () => {
    if (mode === 'readFails') throw enoent('all.config.json');
    return { global: {}, realm: {} };
  });
  config.getFullExportConfigFromDirectory
    .mockReset()
    .mockImplementation(async () => {
      if (mode === 'readFails') throw enoent('/work');
      return { global: {}, realm: {} };
    });
  frodo.config.importFullConfiguration
    .mockReset()
    .mockImplementation(async (_data, _options, callback) => {
      if (mode === 'empty') return [];
      callback(undefined, { part: 1 });
      if (mode === 'oneFails') {
        callback(itemError('Error Importing Journeys'));
      } else {
        callback(undefined, { part: 2 });
      }
      callback(undefined, { part: 3 });
      return [{}, {}, {}];
    });
}

/** The proxies the library was asked to import, in the order it saw them. */
const proxiesImported = () =>
  frodo.idm.remoteProxy.importRemoteProxies.mock.calls.flatMap(([data]) =>
    Object.keys(data.remoteProxy)
  );

function arrangeProxyLibrary(mode) {
  frodo.idm.remoteProxy.importRemoteProxies
    .mockReset()
    .mockImplementation(async (data) => {
      if (mode === 'oneFails') {
        throw new FrodoError('Error importing remote proxies', [
          itemError('Error updating remote proxy b'),
        ]);
      }
      return Object.keys(data.remoteProxy).map((id) => ({ _id: id }));
    });
}

function arrangeMappingLibrary(mode) {
  frodo.idm.mapping.importMappings.mockReset().mockImplementation(async () => {
    if (mode === 'oneFails') {
      throw new FrodoError('Error importing mappings', [
        itemError('Error updating mapping mapping/b'),
      ]);
    }
  });
}

describe.each(CASES)('$name', (c) => {
  test('imports what it can after one failed, names the failed one in one summary and fails', async () => {
    c.arrange('oneFails');

    expect(await c.run()).toBe(false);

    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaryLevel()).toBe('error');
    expect(summary()).toBe(c.oneFails);
    // the ops function leaves the exit code to its caller (record 0033)
    expect(process.exitCode).toBeUndefined();
  });

  test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
    c.arrange('oneFails');

    expect(await c.run(true)).toBe(true);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaryLevel()).toBe('warn');
    expect(summary()).toContain(c.oneFails);
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('prints no summary when nothing failed', async () => {
    c.arrange('clean');

    expect(await c.run()).toBe(true);

    expect(printError).not.toHaveBeenCalled();
    expect(summary()).toBe('');
  });

  test('fails whatever --allow-failures says when it cannot read what the command line names', async () => {
    c.arrange('readFails');

    expect(await c.run(true)).toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe(''); // the error is shown once, no summary
  });

  test('succeeds without a summary when there is nothing to import (record 0041)', async () => {
    c.arrange('empty');

    expect(await c.run()).toBe(true);

    expect(printError).not.toHaveBeenCalled();
    expect(summary()).toBe('');
  });
});

describe('idm import -a: the library call', () => {
  test('hands the library every entity of the file and a result callback', async () => {
    CASES[0].arrange('clean');

    await CASES[0].run();

    const [data, entityId, , callback] =
      frodo.idm.config.importConfigEntities.mock.calls[0];
    expect(Object.keys(data.idm)).toEqual(IDS);
    expect(entityId).toBeUndefined();
    expect(typeof callback).toBe('function');
  });

  test('a file that is not JSON fails the command whatever --allow-failures says', async () => {
    CASES[0].arrange('clean');
    files.set('all.idm.json', '{not json');

    expect(await CASES[0].run(true)).toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe('');
    expect(frodo.idm.config.importConfigEntities.mock.calls).toHaveLength(0);
  });

  test('ends the progress line with the failure when an entity failed', async () => {
    CASES[0].arrange('oneFails');

    await CASES[0].run();

    expect(stopProgressIndicator.mock.calls.at(-1)[2]).toBe('fail');
  });

  test('ends the progress line with success when nothing failed', async () => {
    CASES[0].arrange('clean');

    await CASES[0].run();

    expect(stopProgressIndicator.mock.calls.at(-1)[1]).toBe(
      'Imported config entities'
    );
    expect(stopProgressIndicator.mock.calls.at(-1)[2]).toBe('success');
  });
});

describe('idm import -A: a file that cannot be parsed', () => {
  test('is one failed item, named in the summary, and the entities of the other files are still imported', async () => {
    CASES[1].arrange('clean');
    frodo.utils.readFiles.mockReset().mockResolvedValue([
      {
        path: '/work/a.idm.json',
        content: JSON.stringify({ idm: { a: { _id: 'a' } } }),
      },
      { path: '/work/bad.idm.json', content: '{not json' },
      {
        path: '/work/c.idm.json',
        content: JSON.stringify({ idm: { c: { _id: 'c' } } }),
      },
    ]);

    expect(await CASES[1].run()).toBe(false);

    const [data] = frodo.idm.config.importConfigEntities.mock.calls[0];
    expect(Object.keys(data.idm).sort()).toEqual(['a', 'c']);
    expect(summary()).toMatch(
      /^1 of 3 config entities failed:\n {2}- \/work\/bad\.idm\.json: /
    );
    expect(printError).toHaveBeenCalledTimes(1);
  });

  test('with --allow-failures the command succeeds and says which file it left out', async () => {
    CASES[1].arrange('clean');
    frodo.utils.readFiles.mockReset().mockResolvedValue([
      { path: '/work/bad.idm.json', content: '{not json' },
      {
        path: '/work/c.idm.json',
        content: JSON.stringify({ idm: { c: { _id: 'c' } } }),
      },
    ]);

    expect(await CASES[1].run(true)).toBe(true);

    expect(summaryLevel()).toBe('warn');
    expect(summary()).toContain('/work/bad.idm.json');
  });

  test('a broken sync.idm.json is named too, and the other entities are still imported', async () => {
    CASES[1].arrange('clean');
    frodo.utils.readFiles.mockReset().mockResolvedValue([
      { path: '/work/sync.idm.json', content: '{not json' },
      {
        path: '/work/c.idm.json',
        content: JSON.stringify({ idm: { c: { _id: 'c' } } }),
      },
    ]);

    expect(await CASES[1].run()).toBe(false);

    expect(summary()).toMatch(
      /^1 of 2 config entities failed:\n {2}- sync\.idm\.json: /
    );
    expect(frodo.idm.config.importConfigEntities.mock.calls).toHaveLength(1);
  });
});

describe('config import -a: nothing was imported', () => {
  test('says so as a warning and succeeds', async () => {
    arrangeFullImport('empty');

    expect(await importEverythingFromFile('all.config.json')).toBe(true);

    expect(printMessage).toHaveBeenCalledWith(
      'No configuration was imported.',
      'warn'
    );
    expect(summary()).toBe('');
  });
});

describe('config import with one file (-f): one operation', () => {
  test('a failure is printed, not summarised, and the function answers false', async () => {
    arrangeFullImport('oneFails');
    config.getConfig.mockReset();

    expect(await importEntityfromFile('script.json', true)).toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe('');
    expect(process.exitCode).toBeUndefined();
  });

  test('succeeds without a summary when the library imports it', async () => {
    arrangeFullImport('clean');
    config.getConfig.mockReset();

    expect(await importEntityfromFile('script.json', true)).toBe(true);

    expect(printError).not.toHaveBeenCalled();
    expect(summary()).toBe('');
  });
});

describe('idm import with one entity (-i, -f): one operation', () => {
  const { importConfigEntityByIdFromFile, importFirstConfigEntityFromFile } =
    modules['src/ops/IdmOps.ts'];

  test('a failed entity is printed, not summarised, and the function answers false instead of setting the exit code', async () => {
    CASES[0].arrange('oneFails');
    files.set('b.idm.json', JSON.stringify({ idm: { b: { _id: 'b' } } }));
    frodo.utils.getTypedFilename.mockReset().mockReturnValue('b.idm.json');

    expect(await importConfigEntityByIdFromFile('b')).toBe(false);

    // the library was asked, and it is its failure that was printed
    expect(frodo.idm.config.importConfigEntities.mock.calls).toHaveLength(1);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe('');
    expect(process.exitCode).toBeUndefined();
  });

  test('the first entity of a file: a failure ends the progress line with fail and answers false', async () => {
    CASES[0].arrange('oneFails');
    files.set('one.idm.json', JSON.stringify({ idm: { b: { _id: 'b' } } }));

    expect(await importFirstConfigEntityFromFile('one.idm.json')).toBe(false);

    expect(frodo.idm.config.importConfigEntities.mock.calls).toHaveLength(1);
    expect(stopProgressIndicator.mock.calls.at(-1)[2]).toBe('fail');
    expect(printError).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
  });

  test('the first entity of a file: success is true', async () => {
    CASES[0].arrange('clean');
    files.set('one.idm.json', JSON.stringify({ idm: { a: { _id: 'a' } } }));

    expect(await importFirstConfigEntityFromFile('one.idm.json')).toBe(true);

    expect(printError).not.toHaveBeenCalled();
  });
});

describe('idm remote-proxy import: the library refuses a proxy', () => {
  const gate = () =>
    new FrodoError('Error importing remote proxies: nothing was imported', [
      new Error(
        "Remote proxy b has authType 'x'; expected 'basic' or 'bearer'"
      ),
    ]);

  test('-a: the refused proxy is named and the others are not attempted', async () => {
    CASES[4].arrange('clean');
    frodo.idm.remoteProxy.importRemoteProxies
      .mockReset()
      .mockRejectedValue(gate());

    expect(await CASES[4].run()).toBe(false);

    expect(summary()).toBe(
      "1 of 3 remote proxies failed, 2 not attempted:\n  - Remote proxy b has authType 'x'; expected 'basic' or 'bearer'\n  - a (not attempted)\n  - c (not attempted)"
    );
  });

  test('--allow-failures does not apply: nothing was imported, so the command fails', async () => {
    CASES[4].arrange('clean');
    frodo.idm.remoteProxy.importRemoteProxies
      .mockReset()
      .mockRejectedValue(gate());

    expect(await CASES[4].run(true)).toBe(false);

    expect(summaryLevel()).toBe('error');
    expect(summary()).toContain(
      'The run stopped because a remote proxy that the others depend on failed; --allow-failures does not apply to that.'
    );
  });

  test('-A: a failed send of one proxy is not the gate: the others count as imported', async () => {
    CASES[5].arrange('oneFails');

    expect(await CASES[5].run()).toBe(false);

    expect(summary()).not.toContain('not attempted');
    expect(proxiesImported()).toEqual(['a', 'b', 'c']);
  });
});

describe('idm remote-proxy import -A: the files', () => {
  test('a file that cannot be parsed is one failed item and the proxies of the other files are still imported', async () => {
    CASES[5].arrange('clean');
    directoryListing = ['a.remoteproxy.idm.json', 'b.remoteproxy.idm.json'];
    files.set('/work/b.remoteproxy.idm.json', '{not json');

    expect(await CASES[5].run()).toBe(false);

    expect(proxiesImported()).toEqual(['a']);
    expect(summary()).toMatch(
      /^1 of 2 remote proxies failed:\n {2}- b\.remoteproxy\.idm\.json: /
    );
  });

  test('a directory without remote proxy files is a warning, not a failure (record 0041)', async () => {
    CASES[5].arrange('empty');

    expect(await CASES[5].run()).toBe(true);

    expect(printMessage).toHaveBeenCalledWith(
      expect.stringContaining('No remote proxy files'),
      'warn'
    );
    expect(frodo.idm.remoteProxy.importRemoteProxies.mock.calls).toHaveLength(
      0
    );
  });

  test('a directory that cannot be read fails whatever --allow-failures says', async () => {
    CASES[5].arrange('readFails');

    expect(await CASES[5].run(true)).toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe('');
  });
});

describe('mapping import -A: the files', () => {
  test('a mapping file that cannot be parsed is one failed item and the mappings of the other files are still imported', async () => {
    CASES[7].arrange('clean');
    frodo.utils.readFiles.mockReset().mockResolvedValue([
      {
        path: '/work/a.mapping.json',
        content: JSON.stringify({
          mapping: { 'mapping/a': { _id: 'mapping/a' } },
        }),
      },
      { path: '/work/b.mapping.json', content: '{not json' },
      {
        path: '/work/sync.idm.json',
        content: JSON.stringify({
          idm: { sync: { mappings: [{ _id: 'sync/d', name: 'd' }] } },
        }),
      },
    ]);

    expect(await CASES[7].run()).toBe(false);

    const [data] = frodo.idm.mapping.importMappings.mock.calls[0];
    expect(Object.keys(data.mapping)).toEqual(['mapping/a']);
    expect(data.sync.mappings.map((it) => it._id)).toEqual(['sync/d']);
    expect(summary()).toMatch(
      /^1 of 3 mappings failed:\n {2}- \/work\/b\.mapping\.json: /
    );
  });

  test('a sync file that cannot be parsed is named, and the other mappings are still imported', async () => {
    CASES[7].arrange('clean');
    frodo.utils.readFiles.mockReset().mockResolvedValue([
      {
        path: '/work/a.mapping.json',
        content: JSON.stringify({
          mapping: { 'mapping/a': { _id: 'mapping/a' } },
        }),
      },
      { path: '/work/sync.idm.json', content: '{not json' },
    ]);

    expect(await CASES[7].run()).toBe(false);

    expect(summary()).toMatch(
      /^1 of 2 mappings failed:\n {2}- sync mappings: /
    );
    expect(frodo.idm.mapping.importMappings.mock.calls).toHaveLength(1);
  });
});

describe('mapping import -a: the library call', () => {
  test('hands the library the mappings of the file and the options', async () => {
    CASES[6].arrange('clean');

    await importMappingsFromFile('mappings.json', { deps: false });

    const [data, options] = frodo.idm.mapping.importMappings.mock.calls[0];
    expect(Object.keys(data.mapping)).toEqual([
      'mapping/a',
      'mapping/b',
      'mapping/c',
    ]);
    expect(options).toEqual({ deps: false });
  });
});
