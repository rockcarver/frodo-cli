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
 * Decision record 0040 for the exports of `realm export`, `role export`,
 * `saml export`, `saml cot export`, `idp export`, `app export` and
 * `oauth client export`.
 *
 * -A / --all-separate (one file per item, a loop in the CLI): when one item
 * cannot be exported or saved, the others still run, one summary names the
 * failed one, and the command fails, unless --allow-failures was given. A
 * failure to read what there is to export fails the command whatever the flag
 * says. Nothing to export is not a failure (record 0041).
 *
 * -a / --all (everything in ONE file): one operation. The library reports the
 * items it could not export in one combined error and returns no export data
 * then, so no file is written and the command fails.
 *
 * A single item (-n, -i): never swallows a failure.
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
const APP_OPTIONS = { useStringArrays: true, deps: true };

/**
 * `separate` describes `-A`: the function, its arguments before
 * `allowFailures`, the plural unit in the summary, whether a failing item fails
 * in the library's export (`export`) or when its file is saved (`write`, where
 * the CLI exports nothing item by item), whether the function shows a progress
 * indicator, and `arrange(mode, log)`, which sets up the library stubs. The
 * modes are `oneFails` (item b), `twoFail` (items a and c), `writeFails` (item b
 * cannot be saved), `clean`, `readFails` and `empty`. `log.attempted` is filled
 * with the ids the failing step was asked to do and `log.written` with the ids
 * that were saved.
 *
 * `all` describes `-a`, `single` a single item.
 */
const CASES = [
  {
    name: 'realm export -A',
    file: 'src/ops/RealmOps.ts',
    fn: 'exportRealmsToFiles',
    args: [true],
    unit: 'realms',
    failsAt: 'write',
    indicator: false,
    read: () => frodo.realm.readRealms,
    items: () => IDS.map((name) => ({ _id: `id-${name}`, name })),
    save: 'saveToFile',
    savedId: (call) => call[1].name,
    exporter: null,
    all: {
      fn: 'exportRealmsToFile',
      args: [undefined, true],
      lib: () => frodo.realm.exportRealms,
    },
    single: {
      fn: 'exportRealmById',
      args: ['x', undefined, true],
      lib: () => frodo.realm.readRealm,
      save: 'saveToFile',
    },
  },
  {
    name: 'role export -A',
    file: 'src/ops/InternalRoleOps.ts',
    fn: 'exportInternalRolesToFiles',
    args: [true],
    unit: 'internal roles',
    failsAt: 'write',
    indicator: false,
    // the library exports all roles with one read: a read failure is its failure
    read: () => frodo.role.exportInternalRoles,
    items: () => ({
      internalRole: Object.fromEntries(
        IDS.map((name) => [`id-${name}`, { _id: `id-${name}`, name }])
      ),
    }),
    save: 'saveToFile',
    savedId: (call) => call[1].name,
    exporter: null,
    all: {
      fn: 'exportInternalRolesToFile',
      args: [undefined, true],
      lib: () => frodo.role.exportInternalRoles,
    },
    single: {
      fn: 'exportInternalRoleToFile',
      args: ['x', undefined, undefined, true],
      lib: () => frodo.role.exportInternalRole,
      save: 'saveJsonToFile',
    },
  },
  {
    name: 'saml export -A',
    file: 'src/ops/Saml2Ops.ts',
    fn: 'exportSaml2ProvidersToFiles',
    args: [true, { deps: true }],
    unit: 'SAML providers',
    failsAt: 'export',
    indicator: true,
    read: () => frodo.saml2.entityProvider.readSaml2ProviderStubs,
    items: () => IDS.map((entityId) => ({ entityId })),
    save: 'saveJsonToFile',
    savedId: (call) => call[0].id,
    exporter: () => frodo.saml2.entityProvider.exportSaml2Provider,
    emptyMessage: ['No entity providers found.', 'info'],
    all: {
      fn: 'exportSaml2ProvidersToFile',
      args: [null, true, { deps: true }],
      lib: () => frodo.saml2.entityProvider.exportSaml2Providers,
    },
    single: {
      fn: 'exportSaml2ProviderToFile',
      args: ['x', null, true, { deps: true }],
      lib: () => frodo.saml2.entityProvider.exportSaml2Provider,
      save: 'saveJsonToFile',
    },
  },
  {
    name: 'saml cot export -A',
    file: 'src/ops/CirclesOfTrustOps.ts',
    fn: 'exportCirclesOfTrustToFiles',
    args: [true],
    unit: 'trust circles',
    failsAt: 'export',
    indicator: true,
    read: () => frodo.saml2.circlesOfTrust.readCirclesOfTrust,
    items: () => IDS.map((_id) => ({ _id, name: `name-${_id}` })),
    save: 'saveJsonToFile',
    savedId: (call) => call[0].id,
    exporter: () => frodo.saml2.circlesOfTrust.exportCircleOfTrust,
    all: {
      fn: 'exportCirclesOfTrustToFile',
      args: [null, true],
      lib: () => frodo.saml2.circlesOfTrust.exportCirclesOfTrust,
    },
    single: {
      fn: 'exportCircleOfTrustToFile',
      args: ['x', null, true],
      lib: () => frodo.saml2.circlesOfTrust.exportCircleOfTrust,
      save: 'saveJsonToFile',
    },
  },
  {
    name: 'idp export -A',
    file: 'src/ops/IdpOps.ts',
    fn: 'exportSocialIdentityProvidersToFiles',
    args: [true],
    unit: 'identity providers',
    failsAt: 'export',
    indicator: true,
    read: () => frodo.oauth2oidc.external.readSocialIdentityProviders,
    items: () => IDS.map((_id) => ({ _id })),
    save: 'saveJsonToFile',
    savedId: (call) => call[0].id,
    exporter: () => frodo.oauth2oidc.external.exportSocialIdentityProvider,
    all: {
      fn: 'exportSocialIdentityProvidersToFile',
      args: ['', true],
      lib: () => frodo.oauth2oidc.external.exportSocialIdentityProviders,
    },
    single: {
      fn: 'exportSocialIdentityProviderToFile',
      args: ['x', '', true],
      lib: () => frodo.oauth2oidc.external.exportSocialIdentityProvider,
      save: 'saveJsonToFile',
    },
  },
  {
    name: 'app export -A',
    file: 'src/ops/ApplicationOps.ts',
    fn: 'exportApplicationsToFiles',
    args: [true, APP_OPTIONS],
    unit: 'applications',
    failsAt: 'export',
    indicator: true,
    read: () => frodo.app.readApplications,
    items: () => IDS.map((name) => ({ _id: `id-${name}`, name })),
    save: 'saveJsonToFile',
    savedId: (call) => call[0].id,
    exporter: () => frodo.app.exportApplication,
    // the library function is given the application id, the summary names the application
    exporterKey: (id) => id.replace(/^id-/, ''),
    all: {
      fn: 'exportApplicationsToFile',
      args: [undefined, true, APP_OPTIONS],
      lib: () => frodo.app.exportApplications,
    },
    single: {
      fn: 'exportApplicationToFile',
      args: ['x', undefined, undefined, true, APP_OPTIONS],
      lib: () => frodo.app.exportApplication,
      save: 'saveJsonToFile',
    },
  },
  {
    name: 'oauth client export -A',
    file: 'src/ops/OAuth2ClientOps.ts',
    fn: 'exportOAuth2ClientsToFiles',
    args: [true, APP_OPTIONS],
    unit: 'clients',
    failsAt: 'export',
    indicator: true,
    read: () => frodo.oauth2oidc.client.readOAuth2Clients,
    items: () => IDS.map((_id) => ({ _id })),
    save: 'saveJsonToFile',
    savedId: (call) => call[0].id,
    exporter: () => frodo.oauth2oidc.client.exportOAuth2Client,
    all: {
      fn: 'exportOAuth2ClientsToFile',
      args: [undefined, true, APP_OPTIONS],
      lib: () => frodo.oauth2oidc.client.exportOAuth2Clients,
    },
    single: {
      fn: 'exportOAuth2ClientToFile',
      args: ['x', undefined, true, APP_OPTIONS],
      lib: () => frodo.oauth2oidc.client.exportOAuth2Client,
      save: 'saveJsonToFile',
    },
  },
];

// every relative import of the modules under test becomes spies, except the
// run tracker, the error cause and the modules under test themselves
const modulesUnderTest = new Set(
  CASES.map((c) => path.resolve(root, c.file).replace(/\.ts$/, ''))
);
const realModules = new Set(['/utils/OperationRun', '/utils/ErrorCause']);
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
  // the colour theme only decorates text
  if (target.endsWith('/utils/ColorTheme')) {
    exports.default = new Proxy({}, { get: () => (text) => text });
  }
  spies.set(target, exports);
  jest.unstable_mockModule(target, () => exports);
}
const { printError, printMessage, stopProgressIndicator } =
  spies.get(consoleTarget);

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

/** The library utilities every ops module uses to name and save files. */
function resetUtils(log) {
  const utils = frodo.utils;
  utils.getFilePath.mockReset().mockImplementation((name) => `/out/${name}`);
  utils.getTypedFilename
    .mockReset()
    .mockImplementation((name, type) => `${name}.${type}.json`);
  utils.titleCase.mockReset().mockImplementation((text) => text);
  utils.getRealmName.mockReset().mockImplementation((text) => text);
  utils.getRealmString.mockReset().mockReturnValue('Alpha');
  utils.saveJsonToFile.mockReset();
  utils.saveToFile.mockReset();
  log.written = [];
}

/** Makes saving fail for item `b` and records the ids that were saved. */
function arrangeSaving(c, mode, log) {
  frodo.utils[c.save].mockImplementation((...args) => {
    const id = c.savedId(args);
    if (
      mode === 'writeFails' ||
      (mode === 'oneFails' && c.failsAt === 'write')
    ) {
      if (id === 'b') throw new Error('could not write b');
    }
    if (
      mode === 'twoFail' &&
      c.failsAt === 'write' &&
      ['a', 'c'].includes(id)
    ) {
      throw new Error(`could not write ${id}`);
    }
    log.written.push(id);
  });
}

/** Sets up the library stubs of a `-A` case. */
function arrange(c, mode, log) {
  resetUtils(log);
  arrangeSaving(c, mode, log);
  const read = c.read();
  read.mockReset();
  if (mode === 'readFails') {
    read.mockRejectedValue(new Error('read failed'));
  } else {
    read.mockResolvedValue(mode === 'empty' ? [] : c.items());
  }
  if (c.fn === 'exportInternalRolesToFiles') {
    // one read of the exported roles, nothing item by item
    read.mockReset();
    if (mode === 'readFails') {
      read.mockRejectedValue(new Error('read failed'));
    } else {
      read.mockResolvedValue(
        mode === 'empty' ? { internalRole: {} } : c.items()
      );
    }
  }
  if (c.exporter) {
    const exporter = c.exporter();
    exporter.mockReset().mockImplementation(async (id) => {
      const key = c.exporterKey ? c.exporterKey(id) : id;
      log.attempted.push(key);
      if (
        (mode === 'oneFails' && key === 'b') ||
        (mode === 'twoFail' && ['a', 'c'].includes(key))
      ) {
        throw new Error(`could not export ${key}`);
      }
      return { id: key };
    });
  }
}

let exitCodeBefore;
let log;
beforeEach(() => {
  jest.clearAllMocks();
  exitCodeBefore = process.exitCode;
  process.exitCode = undefined;
  log = { attempted: [], written: [] };
});
afterEach(() => {
  process.exitCode = exitCodeBefore;
});

describe.each(CASES)('$name', (c) => {
  const run = (allowFailures) =>
    modules[c.file][c.fn](...c.args, allowFailures);
  const failedReason = (id) =>
    c.failsAt === 'write' ? `could not write ${id}` : `could not export ${id}`;

  test('handles every item after one failed, names it in one summary and fails', async () => {
    arrange(c, 'oneFails', log);

    expect(await run()).toBe(false);

    // the others were still handled
    expect(log.written).toEqual(['a', 'c', 'd']);
    if (c.exporter) expect(log.attempted).toEqual(IDS);
    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaryLevel()).toBe('error');
    expect(summary()).toBe(
      `1 of 4 ${c.unit} failed:\n  - b: ${failedReason('b')}`
    );
    // the ops function leaves the exit code to its caller (record 0033)
    expect(process.exitCode).toBeUndefined();
  });

  test('names every failed item when several fail, in the order they were handled', async () => {
    arrange(c, 'twoFail', log);

    expect(await run()).toBe(false);

    expect(log.written).toEqual(['b', 'd']);
    expect(printError).toHaveBeenCalledTimes(2);
    expect(summary()).toBe(
      `2 of 4 ${c.unit} failed:\n  - a: ${failedReason('a')}\n  - c: ${failedReason('c')}`
    );
  });

  test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
    arrange(c, 'oneFails', log);

    expect(await run(true)).toBe(true);

    expect(log.written).toEqual(['a', 'c', 'd']);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaryLevel()).toBe('warn');
    expect(summary()).toContain(`${c.unit} failed`);
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  if (c.failsAt === 'export') {
    test('an item whose file cannot be saved is a failure too, and the others are saved', async () => {
      arrange(c, 'writeFails', log);

      expect(await run()).toBe(false);

      expect(log.attempted).toEqual(IDS);
      expect(log.written).toEqual(['a', 'c', 'd']);
      expect(summary()).toBe(
        `1 of 4 ${c.unit} failed:\n  - b: could not write b`
      );
    });
  }

  test('prints no summary and no error when nothing failed', async () => {
    arrange(c, 'clean', log);

    expect(await run()).toBe(true);

    expect(log.written).toEqual(IDS);
    expect(summary()).toBe('');
    expect(printError).not.toHaveBeenCalled();
  });

  test('fails whatever --allow-failures says when it cannot read what there is to export', async () => {
    arrange(c, 'readFails', log);

    expect(await run(true)).toBe(false);

    expect(log.written).toEqual([]);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe(''); // the error is shown once, no summary
  });

  test('succeeds when there is nothing to export (record 0041)', async () => {
    arrange(c, 'empty', log);

    expect(await run()).toBe(true);

    expect(log.written).toEqual([]);
    expect(printError).not.toHaveBeenCalled();
    expect(summary()).toBe('');
    if (c.emptyMessage) {
      expect(printMessage).toHaveBeenCalledWith(...c.emptyMessage);
    }
  });

  if (c.indicator) {
    test('the progress indicator ends as failed after a failure and as successful after a clean run', async () => {
      // the last one stops the indicator of the whole export
      const lastStatus = () => stopProgressIndicator.mock.calls.at(-1)[2];
      arrange(c, 'oneFails', log);
      await run();
      expect(lastStatus()).toBe('fail');

      jest.clearAllMocks();
      arrange(c, 'clean', log);
      await run();
      expect(lastStatus()).toBe('success');
    });

    test('the progress indicator ends as failed when it cannot read what there is to export', async () => {
      arrange(c, 'readFails', log);
      await run();
      expect(stopProgressIndicator.mock.calls.at(-1)[2]).toBe('fail');
    });
  }

  describe('-a, everything in one file', () => {
    const runAll = () => modules[c.file][c.all.fn](...c.all.args);

    test('saves the file once when the library exports everything', async () => {
      resetUtils(log);
      c.all.lib().mockReset().mockResolvedValue({ id: 'all' });

      expect(await runAll()).toBe(true);

      expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(1);
      expect(frodo.utils.saveJsonToFile.mock.calls[0][0]).toEqual({
        id: 'all',
      });
      expect(printError).not.toHaveBeenCalled();
    });

    test('writes no file and fails when the library reports items it could not export; the error names them', async () => {
      resetUtils(log);
      const combined = new FrodoError('Error exporting items', [
        new FrodoError('Error exporting item b', [new Error('boom')]),
      ]);
      c.all.lib().mockReset().mockRejectedValue(combined);

      expect(await runAll()).toBe(false);

      expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(0);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(printError.mock.calls[0][0]).toBe(combined);
      expect(summary()).toBe(''); // one operation: nothing to summarize
    });

    test('fails when the file cannot be saved', async () => {
      resetUtils(log);
      c.all.lib().mockReset().mockResolvedValue({ id: 'all' });
      frodo.utils.saveJsonToFile.mockImplementation(() => {
        throw new Error('disk full');
      });

      expect(await runAll()).toBe(false);

      expect(printError).toHaveBeenCalledTimes(1);
    });
  });

  describe('a single item', () => {
    const runSingle = () => modules[c.file][c.single.fn](...c.single.args);

    test('succeeds and saves the file', async () => {
      resetUtils(log);
      c.single.lib().mockReset().mockResolvedValue({ id: 'x' });

      expect(await runSingle()).toBe(true);

      expect(frodo.utils[c.single.save].mock.calls).toHaveLength(1);
      expect(printError).not.toHaveBeenCalled();
    });

    test('fails and says why when the library cannot export it', async () => {
      resetUtils(log);
      c.single.lib().mockReset().mockRejectedValue(new Error('not found'));

      expect(await runSingle()).toBe(false);

      expect(frodo.utils[c.single.save].mock.calls).toHaveLength(0);
      expect(printError).toHaveBeenCalledTimes(1);
    });

    test('fails and says why when the file cannot be saved', async () => {
      resetUtils(log);
      c.single.lib().mockReset().mockResolvedValue({ id: 'x' });
      frodo.utils[c.single.save].mockImplementation(() => {
        throw new Error('disk full');
      });

      expect(await runSingle()).toBe(false);

      expect(printError).toHaveBeenCalledTimes(1);
    });

    test('fails and says why when the output folder cannot be created', async () => {
      resetUtils(log);
      c.single.lib().mockReset().mockResolvedValue({ id: 'x' });
      frodo.utils.getFilePath.mockImplementation(() => {
        throw new Error('cannot create folder');
      });

      expect(await runSingle()).toBe(false);

      expect(printError).toHaveBeenCalledTimes(1);
    });
  });
});

describe('realm export -A: the root realm', () => {
  test('is named root in the summary and in its file name', async () => {
    const c = CASES[0];
    resetUtils(log);
    frodo.realm.readRealms.mockReset().mockResolvedValue([
      { _id: '/', name: '/' },
      { _id: 'x', name: undefined },
    ]);
    frodo.utils.saveToFile.mockImplementation(() => {
      throw new Error('disk full');
    });

    expect(await modules[c.file].exportRealmsToFiles(true)).toBe(false);

    expect(summary()).toBe(
      '2 of 2 realms failed:\n  - root: disk full\n  - root: disk full'
    );
    expect(frodo.utils.getTypedFilename.mock.calls).toEqual([
      ['root', 'realm'],
      ['root', 'realm'],
    ]);
  });
});
