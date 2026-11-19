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
 * Decision record 0040 for the bulk deletes whose items the CLI cannot see from
 * a single library call: `app delete -a`, `idm remote-proxy delete -a`,
 * `log key delete -a` and `oauth client delete -a` (the ops function reads the
 * items and deletes them one by one), and `node delete -a`,
 * `secretstore delete -a`, `secretstore mapping delete -a` and
 * `iga workflow delete -a` (the library calls a result callback per item).
 * When one delete fails, the others still run, one summary names the failed one,
 * and the command fails, unless --allow-failures was given. A failure to read
 * what there is to delete fails the command whatever the flag says.
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

const CASES = [
  {
    name: 'app delete -a',
    file: 'src/ops/ApplicationOps.ts',
    fn: 'deleteApplications',
    args: [true],
    way: 'loop',
    facade: () => frodo.app,
    read: 'readApplications',
    del: 'deleteApplication',
    items: IDS.map((id) => ({ _id: id, name: `app-${id}` })),
    argOf: (item) => item._id,
    nameOf: (item) => item.name,
    unit: 'applications',
  },
  {
    name: 'idm remote-proxy delete -a',
    file: 'src/ops/RemoteProxyOps.ts',
    fn: 'deleteRemoteProxies',
    args: [],
    way: 'loop',
    facade: () => frodo.idm.remoteProxy,
    setup: () => {
      frodo.idm.remoteProxy.REMOTE_PROXY_TYPE = 'remote-proxy';
    },
    read: 'readRemoteProxies',
    del: 'deleteRemoteProxy',
    items: IDS.map((id) => ({ _id: `remote-proxy/${id}` })),
    argOf: (item) => item._id.replace('remote-proxy/', ''),
    nameOf: (item) => item._id.replace('remote-proxy/', ''),
    unit: 'remote proxies',
  },
  {
    name: 'log key delete -a',
    file: 'src/ops/LogOps.ts',
    fn: 'deleteLogApiKeys',
    args: [],
    way: 'loop',
    facade: () => frodo.cloud.log,
    read: 'getLogApiKeys',
    del: 'deleteLogApiKey',
    items: IDS.map((id) => ({ name: `key-${id}`, api_key_id: `id-${id}` })),
    argOf: (item) => item.api_key_id,
    nameOf: (item) => item.name,
    unit: 'keys',
  },
  {
    name: 'oauth client delete -a',
    file: 'src/ops/OAuth2ClientOps.ts',
    fn: 'deleteOauth2Clients',
    args: [],
    way: 'loop',
    facade: () => frodo.oauth2oidc.client,
    read: 'readOAuth2Clients',
    del: 'deleteOAuth2Client',
    items: IDS.map((id) => ({ _id: `client-${id}` })),
    argOf: (item) => item._id,
    nameOf: (item) => item._id,
    unit: 'clients',
  },
  {
    name: 'node delete -a',
    file: 'src/ops/NodeOps.ts',
    fn: 'deleteCustomNodes',
    args: [],
    way: 'callback',
    facade: () => frodo.authn.node,
    del: 'deleteCustomNodes',
    unit: 'custom nodes',
  },
  {
    name: 'secretstore delete -a',
    file: 'src/ops/SecretStoreOps.ts',
    fn: 'deleteSecretStores',
    args: [false],
    way: 'callback',
    facade: () => frodo.secretStore,
    del: 'deleteSecretStores',
    unit: 'secret stores',
  },
  {
    name: 'secretstore mapping delete -a',
    file: 'src/ops/SecretStoreOps.ts',
    fn: 'deleteSecretStoreMappings',
    args: ['store-1', undefined, false],
    way: 'callback',
    facade: () => frodo.secretStore,
    del: 'deleteSecretStoreMappings',
    unit: 'mappings',
  },
  {
    name: 'iga workflow delete -a',
    file: 'src/ops/cloud/iga/IgaWorkflowOps.ts',
    fn: 'deleteWorkflows',
    args: [false, false, false],
    way: 'callback',
    facade: () => frodo.cloud.iga.workflow,
    del: 'deleteWorkflows',
    unit: 'workflows',
  },
];

// every relative import of the modules under test becomes spies, except the
// run tracker, the helper it reads the cause of a failure with, and the modules
// under test themselves
const modulesUnderTest = new Set(
  CASES.map((c) => path.resolve(root, c.file).replace(/\.ts$/, ''))
);
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
      target.endsWith('/utils/OperationRun') ||
      target.endsWith('/utils/ErrorCause')
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

const modules = {};
for (const { file } of CASES) {
  modules[file] = await import(path.resolve(root, file));
}

const summary = () => printMessage.mock.calls.map(([text]) => text).join('\n');
const level = () => printMessage.mock.calls[0]?.[1];

describe.each(CASES)('$name', (c) => {
  let deleteMock;
  let readMock;
  let attempted;
  let exitCodeBefore;
  const failing = c.way === 'loop' ? c.items[1] : undefined;

  /** The library calls the result callback once per item; the item `b` failed. */
  const callbackWith = (failures) =>
    jest.fn(async (...args) => {
      const callback = args.find((arg) => typeof arg === 'function');
      for (const id of IDS) {
        if (failures.includes(id)) {
          callback(
            new FrodoError(`Error deleting item ${id}`, [
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
    attempted = [];
    c.setup?.();
    deleteMock = c.facade()[c.del];
    if (c.way === 'loop') {
      readMock = c.facade()[c.read];
      readMock.mockReset().mockResolvedValue(c.items);
      deleteMock.mockReset().mockImplementation(async (arg) => {
        attempted.push(arg);
        if (arg === c.argOf(failing)) throw new Error('could not delete b');
      });
    } else {
      deleteMock.mockReset().mockImplementation(callbackWith(['b']));
    }
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
  });

  const run = (allowFailures) =>
    modules[c.file][c.fn](...c.args, allowFailures);

  test('handles every item after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    if (c.way === 'loop') {
      expect(attempted).toEqual(c.items.map(c.argOf));
    }
    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printMessage).toHaveBeenCalledTimes(1);
    expect(level()).toBe('error');
    const failedName =
      c.way === 'loop' ? c.nameOf(failing) : 'Error deleting item b';
    expect(summary()).toBe(
      `1 of 4 ${c.unit} failed:\n  - ${failedName}: could not delete b`
    );
    // the ops function leaves the exit code to its caller (record 0033)
    expect(process.exitCode).toBeUndefined();
  });

  test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(level()).toBe('warn');
    expect(summary()).toContain(`${c.unit} failed`);
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary when nothing failed', async () => {
    if (c.way === 'loop') {
      deleteMock.mockReset().mockResolvedValue(undefined);
    } else {
      deleteMock.mockReset().mockImplementation(callbackWith([]));
    }

    expect(await run()).toBe(true);
    expect(printMessage).not.toHaveBeenCalled();
    expect(printError).not.toHaveBeenCalled();
  });

  test('fails whatever --allow-failures says when it cannot read what there is to delete', async () => {
    if (c.way === 'loop') {
      readMock.mockReset().mockRejectedValue(new Error('read failed'));
    } else {
      deleteMock.mockReset().mockRejectedValue(new Error('read failed'));
    }

    expect(await run(true)).toBe(false);
    if (c.way === 'loop') expect(deleteMock.mock.calls).toHaveLength(0);
    expect(printError).toHaveBeenCalled();
    expect(printMessage).not.toHaveBeenCalled(); // the error is shown once, no summary
  });
});
