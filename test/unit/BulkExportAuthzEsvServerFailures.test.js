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
 * Decision record 0040 for the bulk exports of `authz policy`, `authz set`,
 * `authz type`, `esv secret`, `esv variable`, `secretstore`, `server`,
 * `iga workflow` and `admin federation`. When one item of a bulk export fails
 * (it cannot be read, exported or written), the others are still exported, one
 * summary names the failed one, and the command fails, unless --allow-failures
 * was given. A failure to read the list fails the command whatever the flag
 * says. A clean run prints no summary.
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
// run tracker
const mocked = new Map();
for (const file of Object.values(FILES)) {
  const source = fs.readFileSync(path.resolve(root, file), 'utf8');
  const importer = path.dirname(path.resolve(root, file));
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
/** One item of every kind: all the fields the ops modules read are the id. */
const item = (id) => ({ _id: id, name: id, uuid: id });

let failExport;
let failWrite;
let exitCodeBefore;

const stem = (filePath) => String(filePath).split('/').pop();
const writeFails = (filePath) =>
  [...failWrite].some((id) => stem(filePath).startsWith(`${id}.`));

beforeEach(() => {
  jest.clearAllMocks();
  exitCodeBefore = process.exitCode;
  process.exitCode = undefined;
  failExport = new Set();
  failWrite = new Set();
  frodo.utils.getTypedFilename
    .mockReset()
    .mockImplementation((name, type) => `${name}.${type}`);
  frodo.utils.getFilePath.mockReset().mockImplementation((file) => file);
  frodo.utils.getWorkingDirectory.mockReset().mockImplementation(() => 'dir');
  frodo.utils.saveJsonToFile.mockReset().mockImplementation((_data, file) => {
    if (writeFails(file)) throw new Error(`could not write ${stem(file)}`);
  });
  frodo.utils.saveToFile
    .mockReset()
    .mockImplementation((_type, _data, _idField, file) => {
      if (writeFails(file)) throw new Error(`could not write ${stem(file)}`);
    });
});

afterEach(() => {
  process.exitCode = exitCodeBefore;
});

// The library stubs are Proxies, which the spy matchers do not accept: calls are asserted on `mock.calls`.

/** An export of one item: fails for the ids in `failExport`. */
const exportOne = async (id) => {
  if (failExport.has(id)) throw new Error(`could not export ${id}`);
  return { exported: id };
};

/** Commands whose -A loop is in the CLI: one library read of the list, then one export and one write per item. */
const LOOP_CASES = [
  {
    name: 'authz policy export -A',
    type: 'policy.authz',
    file: 'policy',
    fn: 'exportPoliciesToFiles',
    plural: 'policies',
    list: () => frodo.authz.policy.readPolicies,
    one: () => frodo.authz.policy.exportPolicy,
    call: (allow) =>
      ops.policy.exportPoliciesToFiles(true, false, undefined, allow),
  },
  {
    name: 'authz policy export -A with a policy set',
    type: 'policy.authz',
    file: 'policy',
    fn: 'exportPoliciesByPolicySetToFiles',
    plural: 'policies',
    list: () => frodo.authz.policy.readPoliciesByPolicySet,
    one: () => frodo.authz.policy.exportPolicy,
    call: (allow) =>
      ops.policy.exportPoliciesByPolicySetToFiles(
        'set1',
        true,
        false,
        undefined,
        allow
      ),
  },
  {
    name: 'authz set export -A',
    type: 'policyset.authz',
    file: 'policySet',
    fn: 'exportPolicySetsToFiles',
    plural: 'policy sets',
    list: () => frodo.authz.policySet.readPolicySets,
    one: () => frodo.authz.policySet.exportPolicySet,
    call: (allow) =>
      ops.policySet.exportPolicySetsToFiles(true, false, undefined, allow),
  },
  {
    name: 'authz type export -A',
    type: 'resourcetype.authz',
    file: 'resourceType',
    fn: 'exportResourceTypesToFiles',
    plural: 'resource types',
    list: () => frodo.authz.resourceType.readResourceTypes,
    one: () => frodo.authz.resourceType.exportResourceType,
    call: (allow) =>
      ops.resourceType.exportResourceTypesToFiles(true, false, allow),
  },
  {
    name: 'esv secret export -A',
    type: 'secret',
    file: 'secret',
    fn: 'exportSecretsToFiles',
    plural: 'secrets',
    list: () => frodo.cloud.secret.readSecrets,
    one: () => frodo.cloud.secret.exportSecret,
    call: (allow) =>
      ops.secret.exportSecretsToFiles(true, false, undefined, undefined, allow),
  },
  {
    name: 'esv variable export -A',
    type: 'variable',
    file: 'variable',
    fn: 'exportVariablesToFiles',
    plural: 'variables',
    list: () => frodo.cloud.variable.readVariables,
    one: () => frodo.cloud.variable.exportVariable,
    call: (allow) =>
      ops.variable.exportVariablesToFiles(false, true, false, allow),
  },
  {
    name: 'admin federation export -A',
    type: 'admin.federation',
    file: 'adminFederation',
    fn: 'exportAdminFederationProvidersToFiles',
    plural: 'providers',
    list: () => frodo.cloud.adminFed.readAdminFederationProviders,
    one: () => frodo.cloud.adminFed.exportAdminFederationProvider,
    call: (allow) =>
      ops.adminFederation.exportAdminFederationProvidersToFiles(true, allow),
  },
];

describe.each(LOOP_CASES)('$name', (c) => {
  beforeEach(() => {
    c.list().mockReset().mockResolvedValue(IDS.map(item));
    c.one().mockReset().mockImplementation(exportOne);
  });

  test('exports every item after one failed, names it in one summary and fails', async () => {
    failExport.add('b');

    expect(await c.call()).toBe(false);

    // the others were exported and written
    expect(c.one().mock.calls.map(([id]) => id)).toEqual(IDS);
    expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(3);
    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printMessage).toHaveBeenCalledTimes(1);
    expect(level()).toBe('error');
    expect(summary()).toBe(
      `1 of 4 ${c.plural} failed:\n  - b: could not export b`
    );
    // the ops function leaves the exit code to its caller (record 0033)
    expect(process.exitCode).toBeUndefined();
  });

  test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
    failExport.add('b');

    expect(await c.call(true)).toBe(true);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(level()).toBe('warn');
    expect(summary()).toContain(`${c.plural} failed`);
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('names every failed item when several fail', async () => {
    failExport.add('a');
    failExport.add('c');

    expect(await c.call()).toBe(false);

    expect(printError).toHaveBeenCalledTimes(2);
    expect(summary()).toBe(
      `2 of 4 ${c.plural} failed:\n  - a: could not export a\n  - c: could not export c`
    );
  });

  test('an item that cannot be written is a failed item and the others are written', async () => {
    failWrite.add('c');

    expect(await c.call()).toBe(false);

    expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(4);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe(
      `1 of 4 ${c.plural} failed:\n  - c: could not write c.${c.type}`
    );
  });

  test('prints no summary when nothing failed', async () => {
    expect(await c.call()).toBe(true);

    expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(4);
    expect(printMessage).not.toHaveBeenCalled();
    expect(printError).not.toHaveBeenCalled();
  });

  test('fails whatever --allow-failures says when it cannot read the list', async () => {
    c.list().mockReset().mockRejectedValue(new Error('read failed'));

    expect(await c.call(true)).toBe(false);

    expect(c.one().mock.calls).toHaveLength(0);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printMessage).not.toHaveBeenCalled(); // the error is shown once, no summary
  });
});

describe('server export -A', () => {
  const call = (allow) =>
    ops.server.exportServersToFiles(false, true, undefined, allow);

  beforeEach(() => {
    frodo.server.exportServers.mockReset().mockResolvedValue({
      server: Object.fromEntries(
        IDS.map((id) => [id, { _id: id, properties: {} }])
      ),
      defaultProperties: {},
    });
  });

  test('saves every server after one could not be saved, names it in one summary and fails', async () => {
    failWrite.add('b');

    expect(await call()).toBe(false);

    // all four were written to their own file
    expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(4);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printMessage).toHaveBeenCalledTimes(1);
    expect(level()).toBe('error');
    expect(summary()).toBe(
      '1 of 4 servers failed:\n  - b: could not write b.server'
    );
    expect(process.exitCode).toBeUndefined();
  });

  test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
    failWrite.add('b');

    expect(await call(true)).toBe(true);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(level()).toBe('warn');
    expect(summary()).toContain('servers failed');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('names every server that could not be saved', async () => {
    failWrite.add('a');
    failWrite.add('d');

    expect(await call()).toBe(false);

    expect(summary()).toBe(
      '2 of 4 servers failed:\n  - a: could not write a.server\n  - d: could not write d.server'
    );
  });

  test('prints no summary when nothing failed', async () => {
    expect(await call()).toBe(true);

    expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(4);
    expect(printMessage).not.toHaveBeenCalled();
    expect(printError).not.toHaveBeenCalled();
  });

  test('fails whatever --allow-failures says when the library cannot read the servers', async () => {
    frodo.server.exportServers
      .mockReset()
      .mockRejectedValue(new Error('read failed'));

    expect(await call(true)).toBe(false);

    expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(0);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printMessage).not.toHaveBeenCalled();
  });

  test('-a is one operation: a file that cannot be written fails it without a summary', async () => {
    failWrite.add('allServers');

    expect(await ops.server.exportServersToFile(undefined, false, true)).toBe(
      false
    );

    expect(printError).toHaveBeenCalledTimes(1);
    expect(printMessage).not.toHaveBeenCalled();
  });
});

describe('secretstore export', () => {
  /** The library reports every secret store to the callback; the ones in `failing` could not be read completely. */
  let failing;

  beforeEach(() => {
    failing = new Set();
    frodo.secretStore.exportSecretStores
      .mockReset()
      .mockImplementation(async (_global, callback) => {
        for (const id of IDS) {
          if (failing.has(id)) {
            callback(
              new FrodoError(`Error reading mappings of secret store ${id}`, [
                new Error('HTTP 500'),
              ])
            );
          } else {
            callback(undefined, { _id: id });
          }
        }
        return {
          secretstore: Object.fromEntries(IDS.map((id) => [id, { _id: id }])),
        };
      });
  });

  describe('-a', () => {
    const call = (allow) =>
      ops.secretStore.exportSecretStoresToFile(undefined, true, true, allow);

    test('hands the library a result callback', async () => {
      await call();

      const args = frodo.secretStore.exportSecretStores.mock.calls[0];
      expect(args[0]).toBe(true);
      expect(typeof args[1]).toBe('function');
    });

    test('names the secret store that could not be read, still writes the file with the others and fails', async () => {
      failing.add('b');

      expect(await call()).toBe(false);

      expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(1);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(level()).toBe('error');
      expect(summary()).toBe(
        '1 of 4 secret stores failed:\n  - Error reading mappings of secret store b: HTTP 500'
      );
    });

    test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
      failing.add('b');

      expect(await call(true)).toBe(true);

      expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(1);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(level()).toBe('warn');
      expect(summary()).toContain(
        'The exit code stays 0 because --allow-failures was given.'
      );
    });

    test('prints no summary when nothing failed', async () => {
      expect(await call()).toBe(true);

      expect(printMessage).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
    });

    test('fails whatever --allow-failures says when the library cannot read the secret stores', async () => {
      frodo.secretStore.exportSecretStores
        .mockReset()
        .mockRejectedValue(new Error('read failed'));

      expect(await call(true)).toBe(false);

      expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(0);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(printMessage).not.toHaveBeenCalled();
    });

    test('a file that cannot be written fails the command without a summary', async () => {
      failWrite.add('allGlobalSecretStores');

      expect(await call(true)).toBe(false);

      expect(printError).toHaveBeenCalledTimes(1);
      expect(printMessage).not.toHaveBeenCalled();
    });
  });

  describe('-A', () => {
    const call = (allow) =>
      ops.secretStore.exportSecretStoresToFiles(true, true, allow);

    test('saves every secret store after one could not be saved, names it in one summary and fails', async () => {
      failWrite.add('b');

      expect(await call()).toBe(false);

      expect(frodo.utils.saveToFile.mock.calls).toHaveLength(4);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(level()).toBe('error');
      expect(summary()).toBe(
        '1 of 4 secret stores failed:\n  - b: could not write b.secretstore'
      );
    });

    test('names a secret store that the library could not read completely and still saves it', async () => {
      failing.add('b');

      expect(await call()).toBe(false);

      expect(frodo.utils.saveToFile.mock.calls).toHaveLength(4);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(summary()).toContain(
        '  - Error reading mappings of secret store b: HTTP 500'
      );
    });

    test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
      failWrite.add('b');

      expect(await call(true)).toBe(true);

      expect(printError).toHaveBeenCalledTimes(1);
      expect(level()).toBe('warn');
      expect(summary()).toContain(
        'The exit code stays 0 because --allow-failures was given.'
      );
    });

    test('prints no summary when nothing failed', async () => {
      expect(await call()).toBe(true);

      expect(frodo.utils.saveToFile.mock.calls).toHaveLength(4);
      expect(printMessage).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
    });

    test('fails whatever --allow-failures says when the library cannot read the secret stores', async () => {
      frodo.secretStore.exportSecretStores
        .mockReset()
        .mockRejectedValue(new Error('read failed'));

      expect(await call(true)).toBe(false);

      expect(frodo.utils.saveToFile.mock.calls).toHaveLength(0);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(printMessage).not.toHaveBeenCalled();
    });
  });
});

describe('iga workflow export', () => {
  let failing;

  beforeEach(() => {
    failing = new Set();
    // like the library: every workflow is reported to the callback, and a callback that throws is reported a second time
    frodo.cloud.iga.workflow.exportWorkflows
      .mockReset()
      .mockImplementation(async (_options, callback) => {
        const merged = { workflow: {} };
        for (const id of IDS) {
          if (failing.has(id)) {
            callback(new FrodoError(`Workflow '${id}' not found.`));
            continue;
          }
          try {
            callback(undefined, { workflow: { [id]: { id } } });
          } catch (error) {
            callback(error);
            continue;
          }
          merged.workflow[id] = { id };
        }
        return merged;
      });
  });

  describe('-a', () => {
    const call = (allow) =>
      ops.workflow.exportWorkflowsToFile(
        undefined,
        true,
        false,
        undefined,
        allow
      );

    test('hands the library a result callback', async () => {
      await call();

      expect(
        typeof frodo.cloud.iga.workflow.exportWorkflows.mock.calls[0][1]
      ).toBe('function');
    });

    test('names the workflow that could not be exported, still writes the file with the others and fails', async () => {
      failing.add('b');

      expect(await call()).toBe(false);

      expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(1);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(level()).toBe('error');
      expect(summary()).toBe(
        "1 of 4 workflows failed:\n  - Workflow 'b' not found."
      );
    });

    test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
      failing.add('b');

      expect(await call(true)).toBe(true);

      expect(printError).toHaveBeenCalledTimes(1);
      expect(level()).toBe('warn');
      expect(summary()).toContain(
        'The exit code stays 0 because --allow-failures was given.'
      );
    });

    test('prints no summary when nothing failed', async () => {
      expect(await call()).toBe(true);

      expect(printMessage).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
    });

    test('fails whatever --allow-failures says when the library cannot read the workflows', async () => {
      frodo.cloud.iga.workflow.exportWorkflows
        .mockReset()
        .mockRejectedValue(new Error('read failed'));

      expect(await call(true)).toBe(false);

      expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(0);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(printMessage).not.toHaveBeenCalled();
    });
  });

  describe('-A', () => {
    const call = (allow) =>
      ops.workflow.exportWorkflowsToFiles(true, false, false, undefined, allow);

    test('names the workflow that could not be exported, saves the others and fails', async () => {
      failing.add('b');

      expect(await call()).toBe(false);

      expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(3);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(level()).toBe('error');
      expect(summary()).toBe(
        "1 of 4 workflows failed:\n  - Workflow 'b' not found."
      );
    });

    test('a workflow that cannot be written is reported once, not a second time by the library', async () => {
      failWrite.add('c');

      expect(await call()).toBe(false);

      expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(4);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(summary()).toBe(
        '1 of 4 workflows failed:\n  - c: could not write c.workflow'
      );
    });

    test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
      failWrite.add('c');

      expect(await call(true)).toBe(true);

      expect(printError).toHaveBeenCalledTimes(1);
      expect(level()).toBe('warn');
      expect(summary()).toContain(
        'The exit code stays 0 because --allow-failures was given.'
      );
    });

    test('prints no summary when nothing failed', async () => {
      expect(await call()).toBe(true);

      expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(4);
      expect(printMessage).not.toHaveBeenCalled();
      expect(printError).not.toHaveBeenCalled();
    });

    test('fails whatever --allow-failures says when the library cannot read the workflows', async () => {
      frodo.cloud.iga.workflow.exportWorkflows
        .mockReset()
        .mockRejectedValue(new Error('read failed'));

      expect(await call(true)).toBe(false);

      expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(0);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(printMessage).not.toHaveBeenCalled();
    });
  });
});

describe('esv variable export -a', () => {
  test('prints the reason when the export fails, and fails', async () => {
    frodo.cloud.variable.exportVariables
      .mockReset()
      .mockRejectedValue(new Error('could not export the variables'));

    expect(
      await ops.variable.exportVariablesToFile(null, false, true, false)
    ).toBe(false);

    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError.mock.calls[0][0].message).toBe(
      'could not export the variables'
    );
  });

  test('succeeds without printing an error', async () => {
    frodo.cloud.variable.exportVariables
      .mockReset()
      .mockResolvedValue({ variables: {} });

    expect(
      await ops.variable.exportVariablesToFile(null, false, true, false)
    ).toBe(true);

    expect(printError).not.toHaveBeenCalled();
  });
});
