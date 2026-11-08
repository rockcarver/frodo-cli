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
 * Decision record 0040 for the exports of the IDM family and of the whole
 * configuration: `config export -a` and `-A`, `idm export -a` and `-A`,
 * `idm schema object export -A`, `idm remote-proxy export -A` and
 * `mapping export -A`.
 * When one item cannot be exported or written, the others still are, one
 * summary names the failed one, and the command fails, unless --allow-failures
 * was given. A failure to read what there is to export fails the command
 * whatever the flag says. Nothing to export is not a failure (record 0041).
 * The commands that export everything into ONE file (`-a`) hand the library the
 * result callback of the run, so the items the library cannot export are named
 * while the file is still written with the others; the file itself is one more
 * operation.
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

const IDS = ['a', 'b', 'c', 'd'];

/**
 * `arrange(mode, attempted)` sets up the library stubs. The modes are `clean`,
 * `oneFails` (item b cannot be written), `readFails` (what there is to export
 * cannot be read), `empty` (there is nothing to export) and the extra modes of
 * the case (`extra`). `attempted` is filled with what was written.
 */
const CASES = [
  {
    name: 'config export -a',
    file: 'src/ops/ConfigOps.ts',
    fn: 'exportEverythingToFile',
    args: [undefined, true, false, undefined],
    // the library reports three parts, one of them failed in the 'libFails' mode;
    // the file is one more operation
    oneFails: {
      summary:
        '1 of 4 items failed:\n  - all.config.json: could not write the file',
      attempted: ['all.config.json'],
    },
    extra: [
      {
        mode: 'libFails',
        summary:
          '1 of 4 items failed:\n  - Error Exporting Mappings: could not export mappings',
        attempted: ['all.config.json'],
      },
    ],
    arrange: (mode, attempted) => {
      frodo.config.exportFullConfiguration
        .mockReset()
        .mockImplementation(async (_options, callback) => {
          if (mode === 'readFails') throw new Error('read failed');
          if (mode === 'empty') return { global: {}, realm: {} };
          callback(undefined, { part: 1 });
          if (mode === 'libFails') {
            callback(
              new FrodoError('Error Exporting Mappings', [
                new Error('could not export mappings'),
              ])
            );
          } else {
            callback(undefined, { part: 2 });
          }
          callback(undefined, { part: 3 });
          return { global: {}, realm: {} };
        });
      frodo.utils.getFilePath.mockReset().mockImplementation((file) => file);
      frodo.utils.saveJsonToFile
        .mockReset()
        .mockImplementation((_data, file) => {
          attempted.push(file);
          if (mode === 'oneFails') throw new Error('could not write the file');
        });
    },
    // an empty export still writes the (empty) file
    emptyAttempted: ['all.config.json'],
    // the counts of a run without a failure: 3 parts and the file
    cleanAttempted: ['all.config.json'],
  },
  {
    name: 'config export -A',
    file: 'src/ops/ConfigOps.ts',
    fn: 'exportEverythingToFiles',
    args: [false, true, false, undefined],
    oneFails: {
      summary:
        '1 of 4 items failed:\n  - realm/alpha/theme: could not write t2',
      attempted: [
        '/work/global/script/s1.script.json',
        '/work/global/theme/t1.theme.json',
        '/work/realm/alpha/script/s2.script.json',
        '/work/realm/alpha/theme/t2.theme.json',
      ],
    },
    extra: [
      {
        mode: 'libFails',
        summary:
          '1 of 5 items failed:\n  - Error Exporting Mappings: could not export mappings',
        attempted: [
          '/work/global/script/s1.script.json',
          '/work/global/theme/t1.theme.json',
          '/work/realm/alpha/script/s2.script.json',
          '/work/realm/alpha/theme/t2.theme.json',
        ],
      },
    ],
    arrange: (mode, attempted) => {
      frodo.config.exportFullConfiguration
        .mockReset()
        .mockImplementation(async (_options, callback) => {
          if (mode === 'readFails') throw new Error('read failed');
          if (mode === 'empty') {
            return { meta: {}, global: { script: {} }, realm: {} };
          }
          if (mode === 'libFails') {
            callback(
              new FrodoError('Error Exporting Mappings', [
                new Error('could not export mappings'),
              ])
            );
          }
          return {
            meta: {},
            global: {
              script: { s1: { name: 's1' } },
              theme: { t1: { name: 't1' } },
            },
            realm: {
              alpha: {
                script: { s2: { name: 's2' } },
                theme: { t2: { name: 't2' } },
              },
            },
          };
        });
      frodo.utils.getWorkingDirectory.mockReset().mockReturnValue('/work');
      frodo.utils.getTypedFilename
        .mockReset()
        .mockImplementation((name, type) => `${name}.${type}.json`);
      frodo.utils.saveJsonToFile
        .mockReset()
        .mockImplementation((_data, file) => {
          attempted.push(file);
          if (mode === 'oneFails' && file.includes('t2')) {
            throw new Error('could not write t2');
          }
        });
    },
    emptyAttempted: [],
    cleanAttempted: [
      '/work/global/script/s1.script.json',
      '/work/global/theme/t1.theme.json',
      '/work/realm/alpha/script/s2.script.json',
      '/work/realm/alpha/theme/t2.theme.json',
    ],
  },
  {
    name: 'idm export -a',
    file: 'src/ops/IdmOps.ts',
    fn: 'exportAllConfigEntitiesToFile',
    args: [undefined, undefined, true],
    oneFails: {
      summary:
        '1 of 4 config entities failed:\n  - all.idm.json: could not write the file',
      attempted: ['all.idm.json'],
    },
    extra: [
      {
        mode: 'libFails',
        summary:
          '1 of 4 config entities failed:\n  - Error exporting idm config entity b: could not read b',
        attempted: ['all.idm.json'],
      },
    ],
    arrange: (mode, attempted) => {
      frodo.idm.config.exportConfigEntities
        .mockReset()
        .mockImplementation(async (_options, callback) => {
          if (mode === 'readFails') throw new Error('read failed');
          if (mode === 'empty') return { idm: {} };
          for (const id of ['a', 'b', 'c']) {
            if (mode === 'libFails' && id === 'b') {
              callback(
                new FrodoError(`Error exporting idm config entity ${id}`, [
                  new Error(`could not read ${id}`),
                ])
              );
            } else {
              callback(undefined, { _id: id });
            }
          }
          return { idm: { a: { _id: 'a' }, c: { _id: 'c' } } };
        });
      frodo.utils.getTypedFilename
        .mockReset()
        .mockImplementation((name, type) => `${name}.${type}.json`);
      frodo.utils.getFilePath.mockReset().mockImplementation((file) => file);
      frodo.utils.saveJsonToFile
        .mockReset()
        .mockImplementation((_data, file) => {
          attempted.push(file);
          if (mode === 'oneFails') throw new Error('could not write the file');
        });
    },
    emptyAttempted: ['all.idm.json'],
    cleanAttempted: ['all.idm.json'],
  },
  {
    name: 'idm export -A',
    file: 'src/ops/IdmOps.ts',
    fn: 'exportAllConfigEntitiesToFiles',
    args: [undefined, true, false],
    oneFails: {
      summary: '1 of 4 config entities failed:\n  - b: could not write b',
      attempted: ['a.idm.json', 'b.idm.json', 'c.idm.json', 'd.idm.json'],
    },
    extra: [
      {
        mode: 'libFails',
        summary:
          '1 of 5 config entities failed:\n  - Error exporting idm config entity x: could not read x',
        attempted: ['a.idm.json', 'b.idm.json', 'c.idm.json', 'd.idm.json'],
      },
    ],
    arrange: (mode, attempted) => {
      frodo.idm.config.exportConfigEntities
        .mockReset()
        .mockImplementation(async (_options, callback) => {
          if (mode === 'readFails') throw new Error('read failed');
          if (mode === 'empty') return { idm: {} };
          if (mode === 'libFails') {
            callback(
              new FrodoError('Error exporting idm config entity x', [
                new Error('could not read x'),
              ])
            );
          }
          return {
            idm: Object.fromEntries(IDS.map((id) => [id, { _id: id }])),
          };
        });
      frodo.utils.getFilePath.mockReset().mockImplementation((file) => file);
      frodo.utils.saveToFile
        .mockReset()
        .mockImplementation((_type, _obj, _key, file) => {
          attempted.push(file);
          if (mode === 'oneFails' && file === 'b.idm.json') {
            throw new Error('could not write b');
          }
        });
    },
    emptyAttempted: [],
    cleanAttempted: ['a.idm.json', 'b.idm.json', 'c.idm.json', 'd.idm.json'],
  },
  {
    name: 'idm schema object export -A',
    file: 'src/ops/IdmOps.ts',
    fn: 'exportManagedObjectsToFiles',
    args: [true],
    // four managed object types and the file that lists them
    oneFails: {
      summary: '1 of 5 managed objects failed:\n  - b: could not write b',
      attempted: ['a', 'b', 'c', 'd'],
    },
    extra: [
      {
        mode: 'indexFails',
        summary:
          '1 of 5 managed objects failed:\n  - managed.idm.json: could not write the list',
        attempted: ['a', 'b', 'c', 'd'],
      },
    ],
    arrange: (mode, attempted) => {
      frodo.idm.config.exportConfigEntity
        .mockReset()
        .mockImplementation(async () => {
          if (mode === 'readFails') throw new Error('read failed');
          return {
            idm: {
              managed: {
                _id: 'managed',
                objects: mode === 'empty' ? [] : IDS.map((name) => ({ name })),
              },
            },
          };
        });
      const config = spies.get(path.resolve(root, 'src/utils/Config'));
      config.extractDataToFile
        .mockReset()
        .mockImplementation((object, file) => {
          attempted.push(object.name);
          if (mode === 'oneFails' && object.name === 'b') {
            throw new Error('could not write b');
          }
          return `file://${file}`;
        });
      frodo.utils.getFilePath.mockReset().mockImplementation((file) => file);
      frodo.utils.saveToFile.mockReset().mockImplementation(() => {
        if (mode === 'indexFails') throw new Error('could not write the list');
      });
    },
    // the list of types is written even when it is empty
    emptyAttempted: [],
    cleanAttempted: ['a', 'b', 'c', 'd'],
  },
  {
    name: 'idm remote-proxy export -A',
    file: 'src/ops/RemoteProxyOps.ts',
    fn: 'exportRemoteProxiesToFiles',
    args: [true],
    oneFails: {
      summary: '1 of 4 remote proxies failed:\n  - b: could not write b',
      attempted: [
        'a.proxy.json',
        'b.proxy.json',
        'c.proxy.json',
        'd.proxy.json',
      ],
    },
    extra: [],
    arrange: (mode, attempted) => {
      const proxies = frodo.idm.remoteProxy;
      proxies.exportRemoteProxies.mockReset().mockImplementation(async () => {
        if (mode === 'readFails') throw new Error('read failed');
        return {
          remoteProxy:
            mode === 'empty'
              ? {}
              : Object.fromEntries(IDS.map((id) => [id, { name: id }])),
        };
      });
      proxies.isValidRemoteProxyName.mockReset().mockReturnValue(true);
      proxies.getTenantBoundSecrets.mockReset().mockReturnValue([]);
      proxies.createRemoteProxyExportTemplate
        .mockReset()
        .mockImplementation(() => ({ remoteProxy: {} }));
      frodo.utils.getTypedFilename
        .mockReset()
        .mockImplementation((name) => `${name}.proxy.json`);
      frodo.utils.getFilePath.mockReset().mockImplementation((file) => file);
      frodo.utils.saveJsonToFile
        .mockReset()
        .mockImplementation((_data, file) => {
          attempted.push(file);
          if (mode === 'oneFails' && file === 'b.proxy.json') {
            throw new Error('could not write b');
          }
        });
    },
    emptyAttempted: [],
    cleanAttempted: [
      'a.proxy.json',
      'b.proxy.json',
      'c.proxy.json',
      'd.proxy.json',
    ],
  },
  {
    name: 'mapping export -A',
    file: 'src/ops/MappingOps.ts',
    fn: 'exportMappingsToFiles',
    args: [true, false, undefined],
    // three new mappings, one legacy mapping and the file that lists the legacy mappings
    oneFails: {
      summary: '1 of 5 mappings failed:\n  - mapping/b: could not write b',
      attempted: [
        'mapping/a',
        'mapping/b',
        'mapping/c',
        'sync/d',
        'sync.idm.json',
      ],
    },
    extra: [
      {
        mode: 'legacyFails',
        summary: '1 of 5 mappings failed:\n  - sync/d: could not write d',
        attempted: [
          'mapping/a',
          'mapping/b',
          'mapping/c',
          'sync/d',
          'sync.idm.json',
        ],
      },
      {
        mode: 'indexFails',
        summary:
          '1 of 5 mappings failed:\n  - sync.idm.json: could not write the list',
        attempted: [
          'mapping/a',
          'mapping/b',
          'mapping/c',
          'sync/d',
          'sync.idm.json',
        ],
      },
    ],
    arrange: (mode, attempted) => {
      frodo.idm.mapping.isLegacyMapping
        .mockReset()
        .mockImplementation((id) => id.startsWith('sync/'));
      frodo.idm.mapping.exportMappings
        .mockReset()
        .mockImplementation(async () => {
          if (mode === 'readFails') throw new Error('read failed');
          if (mode === 'empty') {
            return { mapping: {}, sync: { _id: 'sync', mappings: [] } };
          }
          return {
            mapping: Object.fromEntries(
              ['a', 'b', 'c'].map((name) => [
                `mapping/${name}`,
                { _id: `mapping/${name}`, name },
              ])
            ),
            sync: { _id: 'sync', mappings: [{ _id: 'sync/d', name: 'd' }] },
          };
        });
      frodo.utils.getTypedFilename
        .mockReset()
        .mockImplementation((name, type) => `${name}.${type}.json`);
      frodo.utils.getFilePath.mockReset().mockImplementation((file) => file);
      // the new mappings are written with saveToFile, the legacy ones with extractDataToFile,
      // and the file that lists them with saveToFile
      frodo.utils.saveToFile
        .mockReset()
        .mockImplementation((type, object, _key, file) => {
          if (type === 'idm') {
            attempted.push('sync.idm.json');
            if (mode === 'indexFails') {
              throw new Error('could not write the list');
            }
            return;
          }
          attempted.push(object._id);
          if (mode === 'oneFails' && object._id === 'mapping/b') {
            throw new Error('could not write b');
          }
        });
      const config = spies.get(path.resolve(root, 'src/utils/Config'));
      config.extractDataToFile
        .mockReset()
        .mockImplementation((object, file) => {
          attempted.push(object._id);
          if (mode === 'legacyFails') throw new Error('could not write d');
          return `file://${file}`;
        });
    },
    emptyAttempted: ['sync.idm.json'],
    cleanAttempted: [
      'mapping/a',
      'mapping/b',
      'mapping/c',
      'sync/d',
      'sync.idm.json',
    ],
  },
];

// every relative import of the modules under test becomes spies, except the
// run tracker and the modules under test themselves
const modulesUnderTest = new Set(
  [...new Set(CASES.map((c) => c.file))].map((file) =>
    path.resolve(root, file).replace(/\.ts$/, '')
  )
);
const realModules = new Set(['/utils/OperationRun', '/utils/ErrorCause']);
const mocked = new Map();
for (const file of new Set(CASES.map((c) => c.file))) {
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
const { printError, printMessage } = spies.get(consoleTarget);

// the directories of the full export exist: nothing is created on disk
jest.unstable_mockModule('fs', () => ({
  default: {
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(() => ['x']),
    rmdirSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
  },
}));

const modules = {};
for (const file of new Set(CASES.map((c) => c.file))) {
  modules[file] = await import(path.resolve(root, file));
}

const summary = () =>
  printMessage.mock.calls
    .map(([text]) => text)
    .filter((text) => /\bfailed:/.test(text))
    .join('\n');
const summaryLevel = () =>
  printMessage.mock.calls.find(([text]) => /\bfailed:/.test(text))?.[1];

let exitCodeBefore;
beforeEach(() => {
  jest.clearAllMocks();
  exitCodeBefore = process.exitCode;
  process.exitCode = undefined;
});
afterEach(() => {
  process.exitCode = exitCodeBefore;
});

describe.each(CASES)('$name', (c) => {
  let attempted;
  beforeEach(() => {
    attempted = [];
  });
  const run = (allowFailures) =>
    modules[c.file][c.fn](...c.args, allowFailures);

  test('writes what it can after one failed, names the failed one in one summary and fails', async () => {
    c.arrange('oneFails', attempted);

    expect(await run()).toBe(false);

    expect(attempted).toEqual(c.oneFails.attempted);
    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaryLevel()).toBe('error');
    expect(summary()).toBe(c.oneFails.summary);
    // the ops function leaves the exit code to its caller (record 0033)
    expect(process.exitCode).toBeUndefined();
  });

  test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
    c.arrange('oneFails', attempted);

    expect(await run(true)).toBe(true);

    expect(attempted).toEqual(c.oneFails.attempted);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaryLevel()).toBe('warn');
    expect(summary()).toContain(c.oneFails.summary);
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
    expect(process.exitCode).toBeUndefined();
  });

  for (const {
    mode,
    summary: expected,
    attempted: expectedAttempted,
  } of c.extra) {
    test(`names the failure in the ${mode} mode`, async () => {
      c.arrange(mode, attempted);

      expect(await run()).toBe(false);

      expect(attempted).toEqual(expectedAttempted);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(summary()).toBe(expected);
    });
  }

  test('prints no summary when nothing failed', async () => {
    c.arrange('clean', attempted);

    expect(await run()).toBe(true);

    expect(attempted).toEqual(c.cleanAttempted);
    expect(printError).not.toHaveBeenCalled();
    expect(summary()).toBe('');
  });

  test('fails whatever --allow-failures says when it cannot read what to export', async () => {
    c.arrange('readFails', attempted);

    expect(await run(true)).toBe(false);

    expect(attempted).toEqual([]);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe(''); // the error is shown once, no summary
  });

  test('succeeds without a summary when there is nothing to export (record 0041)', async () => {
    c.arrange('empty', attempted);

    expect(await run()).toBe(true);

    expect(attempted).toEqual(c.emptyAttempted);
    expect(printError).not.toHaveBeenCalled();
    expect(summary()).toBe('');
  });
});
