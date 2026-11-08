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
 * Decision record 0040 for `esv secret version prune -i`: every version of the
 * secret that is pruned is one operation. The library tries every version and
 * reports the ones it cannot delete to the result callback; they are printed
 * and named in one summary, and the command fails, unless --allow-failures was
 * given. A secret or its versions that cannot be read end the command whatever
 * the flag says. (The plan that `-a` and `--dry-run` use is tested in
 * EsvSecretVersionPrunePlan.test.js.)
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

const FILE = 'src/ops/cloud/SecretsOps.ts';

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
const { printError, printMessage } = spies.get(consoleTarget);

const { pruneVersionsOfSecret } = await import(path.resolve(root, FILE));
const { pruneVersionsOfSecret: libPrune } = frodo.cloud.secret;

const summary = () => printMessage.mock.calls.map(([text]) => text).join('\n');
const failedVersion = (secretId, version, reason) =>
  new FrodoError(`Failed to prune version ${version} of secret ${secretId}`, [
    new Error(reason),
  ]);

/** The library: reports the failed versions to the callback, returns one entry per version (null for a failed one). */
const library = (failures) =>
  jest.fn(async (secretId, keepLoaded, keepDeactivated, callback) => {
    const results = [];
    for (const version of ['1', '2', '3']) {
      if (failures[version]) {
        callback(failedVersion(secretId, version, failures[version]));
        results.push(null);
      } else {
        callback(undefined, { version });
        results.push({ version });
      }
    }
    return results;
  });

describe('esv secret version prune -i', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    libPrune.mockReset().mockImplementation(library({}));
  });

  test('hands the library the keep options and a callback, and prints nothing when every version was pruned', async () => {
    expect(await pruneVersionsOfSecret('esv-a', true, true)).toBe(true);

    expect(libPrune.mock.calls).toHaveLength(1);
    expect(libPrune.mock.calls[0].slice(0, 3)).toEqual(['esv-a', true, true]);
    expect(typeof libPrune.mock.calls[0][3]).toBe('function');
    expect(printMessage).not.toHaveBeenCalled();
    expect(printError).not.toHaveBeenCalled();
  });

  test('names the versions that could not be deleted in one summary, and fails', async () => {
    libPrune.mockImplementation(library({ 2: 'forbidden', 3: 'gone' }));

    expect(await pruneVersionsOfSecret('esv-a')).toBe(false);

    expect(printError.mock.calls).toHaveLength(2);
    expect(summary()).toContain('2 of 3 versions failed:');
    expect(summary()).toContain(
      '  - Failed to prune version 2 of secret esv-a: forbidden'
    );
    expect(summary()).toContain(
      '  - Failed to prune version 3 of secret esv-a: gone'
    );
    expect(summary()).not.toContain('version 1');
    expect(printMessage.mock.calls[0][1]).toBe('error');
  });

  test('--allow-failures reports the versions that failed but succeeds', async () => {
    libPrune.mockImplementation(library({ 1: 'forbidden' }));

    expect(await pruneVersionsOfSecret('esv-a', false, false, true)).toBe(true);

    expect(summary()).toContain('1 of 3 versions failed:');
    expect(summary()).toContain('The exit code stays 0');
    expect(printMessage.mock.calls[0][1]).toBe('warn');
  });

  test('a secret that cannot be read fails the command whatever --allow-failures says', async () => {
    libPrune.mockRejectedValue(
      new FrodoError('Error pruning versions of secret esv-a', [
        new Error('not found'),
      ])
    );

    expect(await pruneVersionsOfSecret('esv-a', false, false, true)).toBe(
      false
    );

    expect(printError.mock.calls).toHaveLength(1);
    expect(printMessage).not.toHaveBeenCalled();
  });
});
