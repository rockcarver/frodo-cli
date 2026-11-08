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
 * Decision record 0040 for the bulk delete of mappings: `mapping delete -a`,
 * with or without `-c` and `-t`. The library reports every mapping to a result
 * callback (a deleted one as a result, a failed one as an error that names it)
 * and throws only when it cannot read the mappings. When one delete fails, the
 * others still run, one summary names the failed one, and the command fails,
 * unless --allow-failures was given. A failure to read the mappings fails the
 * command whatever the flag says. Nothing to delete is not a failure (record
 * 0041): the command says so and succeeds.
 *
 * The real import graph of the ops modules pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the library is a deep
 * stub and every relative import of the module under test is a set of spies
 * (OperationRun and the module itself stay real).
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

const IDS = ['mapping/a', 'mapping/b', 'mapping/c', 'sync/d'];
const FILE = 'src/ops/MappingOps.ts';

// every relative import of the module under test becomes spies, except the run
// tracker
const mocked = new Map();
{
  const source = fs.readFileSync(path.resolve(root, FILE), 'utf8');
  const importer = path.dirname(path.resolve(root, FILE));
  for (const [, clause, from] of source.matchAll(
    /^import (?!type )([^;]*?) from '(\.[^']+)';/gms
  )) {
    const target = path.resolve(importer, from).replace(/\.(js|ts)$/, '');
    if (target.endsWith('/utils/OperationRun')) continue;
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
const { printError, printMessage } = spies.get(consoleTarget);

const ops = await import(path.resolve(root, FILE));

const summary = () => printMessage.mock.calls.map(([text]) => text).join('\n');
const level = () => printMessage.mock.calls[0]?.[1];

describe('mapping delete -a', () => {
  let deleteMock;
  let exitCodeBefore;

  /** The library calls the result callback once per mapping; the ones in `failures` failed. */
  const callbackWith = (failures) =>
    jest.fn(async (...args) => {
      const callback = args.find((arg) => typeof arg === 'function');
      for (const id of IDS) {
        if (failures.includes(id)) {
          callback(
            new FrodoError(`Error deleting mapping ${id}`, [
              new Error(`could not delete ${id}`),
            ])
          );
        } else {
          callback(undefined, { _id: id });
        }
      }
    });

  beforeEach(() => {
    jest.clearAllMocks();
    exitCodeBefore = process.exitCode;
    process.exitCode = undefined;
    deleteMock = frodo.idm.mapping.deleteMappings;
    deleteMock.mockReset().mockImplementation(callbackWith(['mapping/b']));
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  const run = (allowFailures, connectorId, moType) =>
    ops.deleteMappings(connectorId, moType, allowFailures);

  test('hands the library the filters and a result callback', async () => {
    await run(false, 'ldap', 'user');

    // asserted on the calls themselves: the library stub is a Proxy, which the
    // spy matchers do not accept
    expect(deleteMock.mock.calls).toHaveLength(1);
    expect(deleteMock.mock.calls[0]).toHaveLength(3);
    expect(deleteMock.mock.calls[0][0]).toBe('ldap');
    expect(deleteMock.mock.calls[0][1]).toBe('user');
    expect(typeof deleteMock.mock.calls[0][2]).toBe('function');
  });

  test('handles every mapping after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printMessage).toHaveBeenCalledTimes(1);
    expect(level()).toBe('error');
    expect(summary()).toBe(
      '1 of 4 mappings failed:\n  - Error deleting mapping mapping/b: could not delete mapping/b'
    );
    // the ops function leaves the exit code to its caller (record 0033)
    expect(process.exitCode).toBeUndefined();
  });

  test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(level()).toBe('warn');
    expect(summary()).toContain('mappings failed');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('names every failed mapping when several fail, a legacy one too', async () => {
    deleteMock
      .mockReset()
      .mockImplementation(callbackWith(['mapping/a', 'sync/d']));

    expect(await run()).toBe(false);
    expect(printError).toHaveBeenCalledTimes(2);
    expect(summary()).toBe(
      '2 of 4 mappings failed:\n  - Error deleting mapping mapping/a: could not delete mapping/a\n  - Error deleting mapping sync/d: could not delete sync/d'
    );
  });

  test('a failed update of sync.json is one failure', async () => {
    deleteMock.mockReset().mockImplementation(
      jest.fn(async (...args) => {
        const callback = args.find((arg) => typeof arg === 'function');
        callback(
          new FrodoError('Error updating legacy mappings', [
            new Error('HTTP 500'),
          ])
        );
        callback(undefined, { _id: 'mapping/a' });
      })
    );

    expect(await run()).toBe(false);
    expect(summary()).toBe(
      '1 of 2 mappings failed:\n  - Error updating legacy mappings: HTTP 500'
    );
  });

  test('prints no summary when nothing failed', async () => {
    deleteMock.mockReset().mockImplementation(callbackWith([]));

    expect(await run()).toBe(true);
    expect(printMessage).not.toHaveBeenCalled();
    expect(printError).not.toHaveBeenCalled();
  });

  test('fails whatever --allow-failures says when it cannot read the mappings', async () => {
    deleteMock.mockReset().mockRejectedValue(new Error('read failed'));

    expect(await run(true)).toBe(false);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printMessage).not.toHaveBeenCalled(); // the error is shown once, no summary
  });

  test('says so and succeeds when there are no mappings to delete (record 0041)', async () => {
    deleteMock.mockReset().mockResolvedValue(undefined);

    expect(await run()).toBe(true);
    expect(printError).not.toHaveBeenCalled();
    expect(printMessage).toHaveBeenCalledTimes(1);
    expect(printMessage).toHaveBeenCalledWith('No mappings found to delete.');
  });
});
