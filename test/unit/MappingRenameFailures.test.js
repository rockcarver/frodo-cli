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
 * Decision record 0040 for `mapping rename -a`: every mapping is one operation.
 * A mapping that cannot be renamed is printed and named in one summary, the
 * other mappings are still renamed, and the command fails, unless
 * --allow-failures was given. A mapping that already has the new id is found
 * from the list of the mappings, not from a failed read. A failure to read the
 * mappings ends the command whatever the flag says. `-i` is one operation.
 *
 * The real import graph of the ops module pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the library is a deep
 * stub and every relative import of the module under test is a set of spies
 * (OperationRun and the module it needs to read causes stay real).
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

const FILE = 'src/ops/MappingOps.ts';

// every relative import of the module under test becomes spies, except the run
// tracker and the module that reads causes
const mocked = new Map();
{
  const source = fs.readFileSync(path.resolve(root, FILE), 'utf8');
  const importer = path.dirname(path.resolve(root, FILE));
  for (const [, clause, from] of source.matchAll(
    /^import (?!type )([^;]*?) from '(\.[^']+)';/gms
  )) {
    const target = path.resolve(importer, from).replace(/\.(js|ts)$/, '');
    if (
      target.endsWith('/utils/OperationRun') ||
      target.endsWith('/utils/ErrorCause')
    )
      continue;
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
const spies = new Map();
for (const [target, names] of mocked) {
  const exports = {};
  for (const name of names) exports[name] = jest.fn();
  spies.set(target, exports);
  jest.unstable_mockModule(target, () => exports);
}
const { printError, printMessage, stopProgressIndicator } =
  spies.get(consoleTarget);

const { renameMappings } = await import(path.resolve(root, FILE));
const {
  readMappings,
  readMapping,
  createMapping,
  updateMapping,
  deleteMapping,
} = frodo.idm.mapping;

const summary = () => printMessage.mock.calls.map(([text]) => text).join('\n');

describe('mapping rename -a', () => {
  let exitCodeBefore;

  /** The mappings as the library lists them: legacy ones with sync/, new ones with mapping/. */
  const listed = (ids) =>
    ids.map((_id) => ({ _id, name: _id.split('/')[1], source: _id }));

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    process.exitCode = undefined;
    readMappings
      .mockReset()
      .mockResolvedValue(listed(['sync/a', 'sync/b', 'sync/c']));
    readMapping.mockReset().mockImplementation(async (id) => ({
      _id: id,
      name: id.split('/')[1],
    }));
    createMapping.mockReset().mockResolvedValue({});
    updateMapping.mockReset().mockResolvedValue({});
    deleteMapping.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  test('renames every mapping to the new scheme, keeps their order, and prints no summary', async () => {
    expect(await renameMappings()).toBe(true);

    expect(createMapping.mock.calls.map(([id]) => id)).toEqual([
      'mapping/a',
      'mapping/b',
      'mapping/c',
    ]);
    // the order is kept through syncAfter: each mapping follows the ones before it
    expect(createMapping.mock.calls.map(([, data]) => data.syncAfter)).toEqual([
      [],
      ['a'],
      ['a', 'b'],
    ]);
    expect(deleteMapping.mock.calls.map(([id]) => id)).toEqual([
      'sync/a',
      'sync/b',
      'sync/c',
    ]);
    expect(printMessage).not.toHaveBeenCalled();
    expect(printError).not.toHaveBeenCalled();
    expect(stopProgressIndicator.mock.calls[0][2]).toBe('success');
  });

  test('--legacy renames the other way round', async () => {
    readMappings.mockResolvedValue(listed(['mapping/a', 'mapping/b']));

    expect(await renameMappings(true)).toBe(true);

    expect(createMapping.mock.calls.map(([id]) => id)).toEqual([
      'sync/a',
      'sync/b',
    ]);
    expect(deleteMapping.mock.calls.map(([id]) => id)).toEqual([
      'mapping/a',
      'mapping/b',
    ]);
  });

  test('a mapping that cannot be renamed does not stop the others; one summary names it and the command fails', async () => {
    createMapping.mockImplementation(async (id) => {
      if (id === 'mapping/b') {
        throw new FrodoError('Error creating mapping mapping/b', [
          new Error('Mapping mapping/b already exists!'),
        ]);
      }
    });

    expect(await renameMappings()).toBe(false);

    // c is renamed although b failed, and the old b is kept
    expect(deleteMapping.mock.calls.map(([id]) => id)).toEqual([
      'sync/a',
      'sync/c',
    ]);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toContain('1 of 3 mappings failed:');
    expect(summary()).toContain('  - b: Error creating mapping mapping/b');
    expect(summary()).not.toContain('--allow-failures');
    expect(printMessage.mock.calls[0][1]).toBe('error');
    expect(stopProgressIndicator.mock.calls[0][2]).toBe('fail');
  });

  test('--allow-failures reports the failed mappings but succeeds', async () => {
    deleteMapping.mockImplementation(async (id) => {
      if (id === 'sync/a') throw new Error('cannot delete sync/a');
    });

    expect(await renameMappings(false, true)).toBe(true);

    // b and c are renamed anyway
    expect(createMapping.mock.calls).toHaveLength(3);
    expect(summary()).toContain('1 of 3 mappings failed:');
    expect(summary()).toContain('  - a: cannot delete sync/a');
    expect(summary()).toContain('The exit code stays 0');
    expect(printMessage.mock.calls[0][1]).toBe('warn');
  });

  test('a mapping that has the new id already only gets its new order, and is not read again', async () => {
    readMappings.mockResolvedValue(listed(['mapping/a', 'sync/b']));

    expect(await renameMappings()).toBe(true);

    expect(updateMapping.mock.calls).toHaveLength(1);
    expect(updateMapping.mock.calls[0][0]).toBe('mapping/a');
    expect(updateMapping.mock.calls[0][1].syncAfter).toEqual([]);
    expect(readMapping.mock.calls.map(([id]) => id)).toEqual(['sync/b']);
    expect(createMapping.mock.calls.map(([id]) => id)).toEqual(['mapping/b']);
  });

  test('a read of a legacy mapping that fails is a failed mapping, not "already renamed"', async () => {
    readMapping.mockImplementation(async (id) => {
      if (id === 'sync/b') throw new Error('network down');
      return { _id: id, name: id.split('/')[1] };
    });

    expect(await renameMappings()).toBe(false);

    expect(updateMapping.mock.calls).toHaveLength(0);
    expect(createMapping.mock.calls.map(([id]) => id)).toEqual([
      'mapping/a',
      'mapping/c',
    ]);
    expect(summary()).toContain('1 of 3 mappings failed:');
    expect(summary()).toContain('  - b: network down');
  });

  test('a failure to read the mappings ends the command whatever --allow-failures says', async () => {
    readMappings.mockRejectedValue(new FrodoError('Error reading mappings'));

    expect(await renameMappings(false, true)).toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(createMapping.mock.calls).toHaveLength(0);
    expect(printMessage).not.toHaveBeenCalled();
  });
});
