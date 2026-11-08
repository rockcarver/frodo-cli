import fs from 'node:fs';
import os from 'node:os';
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
 * Decision records 0040 and 0041 for the config-manager pulls and pushes of
 * part 2c: `pull` and `push` of connector-definitions, internal-roles,
 * email-templates and variables, `pull managed-objects`,
 * `pull connector-mappings` and `push csp` (the remote proxies are covered by
 * RemoteProxyOps.test.js).
 *
 * A pull writes one file per item. When one item cannot be written the others
 * are still written, one summary names the failed one, and the command fails,
 * unless --allow-failures was given. A push reads one file per item and hands
 * all items to the library once: a file that cannot be read, or an item the
 * library cannot import, is named in the one summary while the others are
 * imported.
 *
 * What the command line names or a pull cannot do at all fails the command
 * whatever the flag says: failing to read the tenant, a named item that does not
 * exist, a missing source folder. Nothing to export, when no item was named, is
 * a success.
 *
 * Same technique as ConfigManagerDeleteFailures.test.js: the library is a deep
 * stub and every relative import of the modules under test is a set of spies,
 * while OperationRun, ImportItems, ErrorCause and the modules themselves stay
 * real. The source folder of a push is a real temporary directory.
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
    this.originalErrors = Array.isArray(originalErrors)
      ? originalErrors
      : originalErrors
        ? [originalErrors]
        : [];
  }
}
const frodo = deepStub();
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo,
  state: deepStub(),
  FrodoError,
}));

const IDS = ['a', 'b', 'c'];

/** The error of a library import function that could not import the items `failing`. */
const combinedError = (unit, failing) =>
  new FrodoError(
    `Error importing ${unit}s`,
    [...failing].map(
      (id) =>
        new FrodoError(
          `Error importing ${unit} ${id}`,
          new Error(`could not import ${id}`)
        )
    )
  );

let directory;

/**
 * The cases of the pulls. `arrange` makes the library read the items a, b and
 * c; the stub of saveJsonToFile fails for the ones in `failing`.
 */
const PULLS = [
  {
    name: 'config-manager pull connector-definitions',
    file: 'src/configManagerOps/FrConfigConnectorDefinitionsOps.ts',
    unit: 'connector',
    arrange: () =>
      frodo.idm.connector.readConnectors
        .mockReset()
        .mockResolvedValue(
          IDS.map((id) => ({ _id: `provisioner.openicf/${id}` }))
        ),
    empty: () =>
      frodo.idm.connector.readConnectors.mockReset().mockResolvedValue([]),
    emptyMessage: /No connector definitions found to export\./,
    failToRead: () =>
      frodo.idm.connector.readConnectors
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    run: (m, allowFailures) =>
      m.configManagerExportConnectorDefinitions(undefined, allowFailures),
    named: (m, allowFailures) =>
      m.configManagerExportConnectorDefinitions('zzz', allowFailures),
    namedMissing: () =>
      frodo.idm.connector.readConnector
        .mockReset()
        .mockRejectedValue(new Error('no such connector')),
  },
  {
    name: 'config-manager pull internal-roles',
    file: 'src/configManagerOps/FrConfigInternalRolesOps.ts',
    unit: 'internal role',
    arrange: () =>
      frodo.role.readInternalRoles
        .mockReset()
        .mockResolvedValue(
          IDS.map((id) => ({ _id: id, name: id, privileges: [{}] }))
        ),
    empty: () => frodo.role.readInternalRoles.mockReset().mockResolvedValue([]),
    emptyMessage: /No internal roles with privileges found to export\./,
    failToRead: () =>
      frodo.role.readInternalRoles
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    run: (m, allowFailures) =>
      m.configManagerExportInternalRoles(undefined, allowFailures),
    named: (m, allowFailures) =>
      m.configManagerExportInternalRoles('zzz', allowFailures),
    namedMissing: () =>
      frodo.role.readInternalRoleByName
        .mockReset()
        .mockRejectedValue(new Error('no such role')),
  },
  {
    name: 'config-manager pull email-templates',
    file: 'src/configManagerOps/FrConfigEmailTemplatesOps.ts',
    unit: 'email template',
    arrange: () =>
      frodo.email.template.readEmailTemplates
        .mockReset()
        .mockResolvedValue(
          IDS.map((id) => ({ _id: `emailTemplate/${id}`, html: { en: 'x' } }))
        ),
    empty: () =>
      frodo.email.template.readEmailTemplates.mockReset().mockResolvedValue([]),
    emptyMessage: /No email templates found to export\./,
    failToRead: () =>
      frodo.email.template.readEmailTemplates
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    run: (m, allowFailures) =>
      m.configManagerExportEmailTemplates(undefined, allowFailures),
    named: (m, allowFailures) =>
      m.configManagerExportEmailTemplates('zzz', allowFailures),
    namedMissing: () =>
      frodo.email.template.readEmailTemplate
        .mockReset()
        .mockRejectedValue(new Error('no such template')),
  },
  {
    name: 'config-manager pull variables',
    file: 'src/configManagerOps/FrConfigVariableOps.ts',
    unit: 'variable',
    arrange: () =>
      frodo.cloud.variable.readVariables
        .mockReset()
        .mockResolvedValue(
          IDS.map((id) => ({ _id: id, expressionType: 'string', value: 'v' }))
        ),
    empty: () =>
      frodo.cloud.variable.readVariables.mockReset().mockResolvedValue([]),
    failToRead: () =>
      frodo.cloud.variable.readVariables
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    run: (m, allowFailures) =>
      m.configManagerExportVariables(false, false, allowFailures),
  },
  {
    name: 'config-manager pull managed-objects',
    file: 'src/configManagerOps/FrConfigManagedObjectsOps.ts',
    unit: 'managed object',
    arrange: () =>
      frodo.idm.config.readConfigEntity.mockReset().mockResolvedValue({
        objects: IDS.map((id) => ({ name: id, schema: { properties: {} } })),
      }),
    empty: () =>
      frodo.idm.config.readConfigEntity
        .mockReset()
        .mockResolvedValue({ objects: [] }),
    emptyMessage: /No managed objects found to export\./,
    failToRead: () =>
      frodo.idm.config.readConfigEntity
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    run: (m, allowFailures) =>
      m.configManagerExportManagedObjects(undefined, false, allowFailures),
    named: (m, allowFailures) =>
      m.configManagerExportManagedObjects('zzz', false, allowFailures),
    namedMessage: /Managed object zzz not found\./,
  },
  {
    name: 'config-manager pull connector-mappings',
    file: 'src/configManagerOps/FrConfigConnectorMappingOps.ts',
    unit: 'mapping',
    arrange: () =>
      frodo.idm.config.readConfigEntity.mockReset().mockResolvedValue({
        mappings: IDS.map((id) => ({ name: id })),
      }),
    empty: () =>
      frodo.idm.config.readConfigEntity
        .mockReset()
        .mockResolvedValue({ mappings: [] }),
    emptyMessage: /No connector mappings found to export\./,
    failToRead: () =>
      frodo.idm.config.readConfigEntity
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    run: (m, allowFailures) =>
      m.configManagerExportMappings(undefined, allowFailures),
    named: (m, allowFailures) =>
      m.configManagerExportMappings('zzz', allowFailures),
    namedMessage: /Mapping zzz not found\./,
  },
];

/**
 * The cases of the pushes. `files(id)` is what the pull wrote for the item;
 * `libImport` is the library function that gets all items at once, and `key`
 * is where it finds them.
 */
const PUSHES = [
  {
    name: 'config-manager push connector-definitions',
    file: 'src/configManagerOps/FrConfigConnectorDefinitionsOps.ts',
    unit: 'connector',
    folder: 'sync/connectors',
    files: (id) => ({
      [`sync/connectors/${id}.json`]: { _id: `provisioner.openicf/${id}` },
    }),
    badFile: 'sync/connectors/b.json',
    summaryNameOfBadFile: 'b.json',
    libImport: () => frodo.idm.connector.importConnectors,
    key: 'connector',
    run: (m, name, allowFailures) =>
      m.configManagerImportConnectors(name, allowFailures),
    missingMessage: /sync\/connectors does not exist/,
    emptyMessage: /No connector definition files found in /,
    namedMessage: /Connector definition file zzz\.json not found in /,
  },
  {
    name: 'config-manager push internal-roles',
    file: 'src/configManagerOps/FrConfigInternalRolesOps.ts',
    unit: 'internal role',
    folder: 'internal-roles',
    files: (id) => ({
      [`internal-roles/${id}.json`]: { _id: id, name: id, privileges: [{}] },
    }),
    badFile: 'internal-roles/b.json',
    summaryNameOfBadFile: 'b.json',
    libImport: () => frodo.role.importInternalRoles,
    key: 'internalRole',
    run: (m, name, allowFailures) =>
      m.configManagerImportInternalRoles(name, allowFailures),
    missingMessage: /internal-roles does not exist/,
    emptyMessage: /No internal role files found in /,
    namedMessage: /Internal role zzz not found in /,
  },
  {
    name: 'config-manager push email-templates',
    file: 'src/configManagerOps/FrConfigEmailTemplatesOps.ts',
    unit: 'email template',
    folder: 'email-templates',
    files: (id) => ({
      [`email-templates/${id}/${id}.json`]: { _id: `emailTemplate/${id}` },
    }),
    badFile: 'email-templates/b/b.json',
    summaryNameOfBadFile: 'b',
    libImport: () => frodo.email.template.importEmailTemplates,
    key: 'emailTemplate',
    run: (m, name, allowFailures) =>
      m.configManagerImportEmailTemplates(name, allowFailures),
    missingMessage: /email-templates does not exist/,
    emptyMessage: /No email template folders found in /,
    namedMessage: /Email template zzz not found in /,
  },
  {
    name: 'config-manager push variables',
    file: 'src/configManagerOps/FrConfigVariableOps.ts',
    unit: 'variable',
    folder: 'esvs/variables',
    files: (id) => ({
      [`esvs/variables/${id}.json`]: { _id: id, valueBase64: 'dg==' },
    }),
    badFile: 'esvs/variables/b.json',
    summaryNameOfBadFile: 'b.json',
    libImport: () => frodo.cloud.variable.importVariables,
    key: 'variable',
    run: (m, name, allowFailures) =>
      m.configManagerImportVariables(name, allowFailures),
    arrange: () =>
      frodo.cloud.variable.readVariables.mockReset().mockResolvedValue([]),
    missingMessage: /No variables directory found/,
    emptyMessage: /No variables found to import/,
    namedMessage: /No matching variable found for zzz/,
  },
];

const CSP_FILE = 'src/configManagerOps/FrConfigCspOps.ts';
const FILES = new Set([...PULLS, ...PUSHES].map((c) => c.file)).add(CSP_FILE);

// every relative import of the modules under test becomes spies, except the
// run tracker, the import helpers, the cause helper and the modules themselves
const modulesUnderTest = new Set(
  [...FILES].map((file) => path.resolve(root, file).replace(/\.ts$/, ''))
);
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
      target.endsWith('/utils/OperationRun') ||
      target.endsWith('/utils/ImportItems') ||
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
for (const [target, names] of mocked) {
  const exports = {};
  for (const name of names) exports[name] = jest.fn();
  mocked.set(target, exports);
  jest.unstable_mockModule(target, () => exports);
}
const { printError, printMessage, stopProgressIndicator } =
  mocked.get(consoleTarget);

const modules = {};
for (const file of FILES) {
  modules[file] = await import(path.resolve(root, file));
}

// the summary is the one message of the shape "N of M <units> failed"
const SUMMARY = /^\d+ of \d+ [\w ]+ failed/;
const summaries = () =>
  printMessage.mock.calls.filter(([text]) => SUMMARY.test(String(text)));
const summary = () =>
  summaries()
    .map(([text]) => text)
    .join('\n');
const level = () => summaries()[0]?.[1];
/** Everything shown to the user as text, also the ending of a progress indicator. */
const shown = () =>
  [
    ...printMessage.mock.calls.map(([text]) => String(text)),
    ...(stopProgressIndicator?.mock.calls ?? []).map(([, text]) =>
      String(text)
    ),
  ].join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-failures-'));
  const utils = frodo.utils;
  utils.getWorkingDirectory.mockReset().mockReturnValue(directory);
  utils.getFilePath
    .mockReset()
    .mockImplementation((file) => path.join(directory, file));
  utils.readJsonFile.mockReset().mockImplementation((file) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      throw new FrodoError(`Error reading file ${file}`, error);
    }
  });
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

describe.each(PULLS)('$name', (c) => {
  let attempted;
  let failing;

  beforeEach(() => {
    attempted = [];
    failing = new Set(['b']);
    c.arrange();
    frodo.utils.saveJsonToFile.mockReset().mockImplementation((data, file) => {
      const relative = path.relative(directory, file);
      const id = IDS.find((it) =>
        new RegExp(`(^|/)${it}(/|\\.json$)`).test(relative)
      );
      attempted.push(id);
      if (failing.has(id)) throw new Error(`could not write ${id}`);
    });
  });

  const run = (allowFailures) => c.run(modules[c.file], allowFailures);

  test('writes every item after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    expect(attempted).toEqual(IDS);
    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalled();
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toBe(
      `1 of 3 ${c.unit}s failed:\n  - b: could not write b`
    );
  });

  test('--allow-failures keeps the command successful, still printing the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(attempted).toEqual(IDS);
    expect(level()).toBe('warn');
    expect(summary()).toContain('  - b: could not write b');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary when every item is written', async () => {
    failing = new Set();

    expect(await run()).toBe(true);
    expect(attempted).toEqual(IDS);
    expect(summaries()).toHaveLength(0);
    expect(shown()).not.toMatch(/found to export/);
  });

  test('fails whatever --allow-failures says when it cannot read the tenant', async () => {
    c.failToRead();

    expect(await run(true)).toBe(false);
    expect(printError).toHaveBeenCalled();
    expect(summaries()).toHaveLength(0); // the error is shown once, no summary
    expect(attempted).toEqual([]);
  });

  test('nothing to export is a success', async () => {
    c.empty();

    expect(await run()).toBe(true);
    expect(printError).not.toHaveBeenCalled();
    expect(summaries()).toHaveLength(0);
    expect(attempted).toEqual([]);
    if (c.emptyMessage) expect(shown()).toMatch(c.emptyMessage);
  });

  if (c.namedMissing) {
    test('a named item that the tenant does not have fails the command whatever --allow-failures says', async () => {
      c.namedMissing();

      expect(await c.named(modules[c.file], true)).toBe(false);
      expect(printError).toHaveBeenCalled();
      expect(summaries()).toHaveLength(0);
      expect(attempted).toEqual([]);
    });
  }

  if (c.namedMessage) {
    test('a named item that the tenant does not have is said plainly and fails the command', async () => {
      expect(await c.named(modules[c.file], true)).toBe(false);
      expect(shown()).toMatch(c.namedMessage);
      expect(summaries()).toHaveLength(0);
      expect(attempted).toEqual([]);
    });
  }
});

describe('config-manager pull internal-roles without privileges', () => {
  const file = 'src/configManagerOps/FrConfigInternalRolesOps.ts';
  const saved = [];

  beforeEach(() => {
    saved.length = 0;
    frodo.utils.saveJsonToFile
      .mockReset()
      .mockImplementation((data, target) => saved.push(target));
    frodo.role.readInternalRoles.mockReset().mockResolvedValue([
      { _id: 'a', name: 'a', privileges: [{}] },
      { _id: 'b', name: 'b', privileges: [] },
      { _id: 'c', name: 'c' },
    ]);
  });

  test('a role without privileges is not exported and is no failure', async () => {
    expect(await modules[file].configManagerExportInternalRoles()).toBe(true);

    expect(saved.map((target) => path.relative(directory, target))).toEqual([
      'internal-roles/a.json',
    ]);
    expect(summaries()).toHaveLength(0);
    expect(shown()).not.toMatch(/found to export/);
  });

  test('when no role has privileges, the command says so and succeeds', async () => {
    frodo.role.readInternalRoles
      .mockReset()
      .mockResolvedValue([{ _id: 'b', name: 'b', privileges: [] }]);

    expect(await modules[file].configManagerExportInternalRoles()).toBe(true);

    expect(saved).toEqual([]);
    expect(shown()).toMatch(
      /No internal roles with privileges found to export/
    );
  });

  test('a named role without privileges is said so and is no failure', async () => {
    frodo.role.readInternalRoleByName
      .mockReset()
      .mockResolvedValue({ _id: 'b', name: 'b', privileges: [] });

    expect(await modules[file].configManagerExportInternalRoles('b')).toBe(
      true
    );

    expect(saved).toEqual([]);
    expect(shown()).toMatch(
      /Internal role b has no privileges and is not exported\./
    );
  });
});

describe.each(PUSHES)('$name', (c) => {
  let imported;
  let failing;

  const writeFile = (relative, content) => {
    const target = path.join(directory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      typeof content === 'string' ? content : JSON.stringify(content)
    );
  };
  const run = (allowFailures, name) =>
    c.run(modules[c.file], name, allowFailures);

  beforeEach(() => {
    imported = [];
    failing = new Set();
    for (const id of IDS) {
      for (const [relative, content] of Object.entries(c.files(id))) {
        writeFile(relative, content);
      }
    }
    c.arrange?.();
    c.libImport()
      .mockReset()
      .mockImplementation(async (data) => {
        const ids = Object.keys(data[c.key]);
        imported.push(ids);
        const bad = ids.filter((id) => failing.has(id));
        if (bad.length > 0) throw combinedError(c.unit, bad);
        return ids.map((id) => ({ _id: id }));
      });
  });

  test('imports all items in one call, prints no summary when they all succeed', async () => {
    expect(await run()).toBe(true);

    expect(imported).toEqual([IDS]);
    expect(summaries()).toHaveLength(0);
    expect(printError).not.toHaveBeenCalled();
  });

  test('names an item that the library cannot import in one summary, the others are imported, and fails', async () => {
    failing = new Set(['b']);

    expect(await run()).toBe(false);

    expect(imported).toEqual([IDS]);
    expect(printError).toHaveBeenCalled();
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toBe(
      `1 of 3 ${c.unit}s failed:\n  - Error importing ${c.unit} b: could not import b`
    );
  });

  test('--allow-failures keeps the command successful for an item the library cannot import', async () => {
    failing = new Set(['b']);

    expect(await run(true)).toBe(true);

    expect(level()).toBe('warn');
    expect(summary()).toContain(`Error importing ${c.unit} b`);
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('a file that cannot be read is named in the summary, the other items are still imported', async () => {
    writeFile(c.badFile, '{ this is not json');

    expect(await run()).toBe(false);

    expect(imported).toEqual([['a', 'c']]);
    expect(printError).toHaveBeenCalled();
    expect(summaries()).toHaveLength(1);
    expect(summary()).toMatch(
      new RegExp(
        `^1 of 3 ${c.unit}s failed:\\n {2}- ${c.summaryNameOfBadFile}: .+`
      )
    );
  });

  test('--allow-failures keeps the command successful for a file that cannot be read', async () => {
    writeFile(c.badFile, '{ this is not json');

    expect(await run(true)).toBe(true);

    expect(imported).toEqual([['a', 'c']]);
    expect(level()).toBe('warn');
  });

  test('hands nothing to the library when every file cannot be read, and names them all', async () => {
    for (const id of IDS) {
      const [relative] = Object.keys(c.files(id));
      writeFile(relative, '{ this is not json');
    }

    expect(await run()).toBe(false);
    expect(await run(true)).toBe(true);

    expect(imported).toEqual([]);
    expect(summaries()).toHaveLength(2);
    expect(summary()).toContain(`3 of 3 ${c.unit}s failed`);
  });

  test('a missing source folder is said plainly and fails whatever --allow-failures says', async () => {
    fs.rmSync(path.join(directory, c.folder), { recursive: true });

    expect(await run(true)).toBe(false);

    expect(imported).toEqual([]);
    expect(shown()).toMatch(c.missingMessage);
    expect(summaries()).toHaveLength(0);
  });

  test('a source folder without items is said plainly and fails whatever --allow-failures says', async () => {
    fs.rmSync(path.join(directory, c.folder), { recursive: true });
    fs.mkdirSync(path.join(directory, c.folder), { recursive: true });

    expect(await run(true)).toBe(false);

    expect(imported).toEqual([]);
    expect(shown()).toMatch(c.emptyMessage);
    expect(summaries()).toHaveLength(0);
  });

  test('a named item is the only one imported', async () => {
    expect(await run(false, 'b')).toBe(true);

    expect(imported).toEqual([['b']]);
    expect(summaries()).toHaveLength(0);
  });

  test('a named item that has no file is said plainly and fails whatever --allow-failures says', async () => {
    expect(await run(true, 'zzz')).toBe(false);

    expect(imported).toEqual([]);
    expect(shown()).toMatch(c.namedMessage);
  });

  test('a named item whose file cannot be read fails whatever --allow-failures says', async () => {
    writeFile(c.badFile, '{ this is not json');

    expect(await run(true, 'b')).toBe(false);

    expect(imported).toEqual([]);
    expect(printError).toHaveBeenCalled();
  });
});

describe('config-manager push csp', () => {
  const file = CSP_FILE;
  let updated;
  let failing;

  const writeCsp = (content) => {
    fs.mkdirSync(path.join(directory, 'csp'), { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'csp/csp.json'),
      typeof content === 'string' ? content : JSON.stringify(content)
    );
  };

  beforeEach(() => {
    updated = [];
    failing = new Set();
    writeCsp({ enforced: { active: true }, 'report-only': { active: false } });
    const update = (policy) => async () => {
      updated.push(policy);
      if (failing.has(policy)) throw new Error(`could not update ${policy}`);
    };
    frodo.cloud.env.updateEnforcedContentSecurityPolicy
      .mockReset()
      .mockImplementation(update('enforced'));
    frodo.cloud.env.updateReportOnlyContentSecurityPolicy
      .mockReset()
      .mockImplementation(update('report-only'));
  });

  const run = (name, allowFailures) =>
    modules[file].configManagerImportCsp(name, allowFailures);

  test('updates both policies and prints no summary when they succeed', async () => {
    expect(await run()).toBe(true);

    expect(updated).toEqual(['enforced', 'report-only']);
    expect(summaries()).toHaveLength(0);
  });

  test('updates the report-only policy after the enforced one failed, names it in one summary and fails', async () => {
    failing = new Set(['enforced']);

    expect(await run()).toBe(false);

    expect(updated).toEqual(['enforced', 'report-only']);
    expect(printError).toHaveBeenCalled();
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toBe(
      '1 of 2 policies failed:\n  - enforced: could not update enforced'
    );
  });

  test('--allow-failures keeps the command successful', async () => {
    failing = new Set(['report-only']);

    expect(await run(undefined, true)).toBe(true);

    expect(updated).toEqual(['enforced', 'report-only']);
    expect(level()).toBe('warn');
    expect(summary()).toContain(
      '  - report-only: could not update report-only'
    );
  });

  test('a name updates only that policy', async () => {
    expect(await run('report-only')).toBe(true);

    expect(updated).toEqual(['report-only']);
    expect(summaries()).toHaveLength(0);
  });

  test('a failing named policy is the one failure of the summary', async () => {
    failing = new Set(['enforced']);

    expect(await run('enforced')).toBe(false);
    expect(summary()).toBe(
      '1 of 1 policy failed:\n  - enforced: could not update enforced'
    );
  });

  test('a name that is neither policy fails before anything is sent, whatever --allow-failures says', async () => {
    expect(await run('zzz', true)).toBe(false);

    expect(updated).toEqual([]);
    expect(printError).toHaveBeenCalled();
    expect(summaries()).toHaveLength(0);
  });

  test('a missing file is said plainly and fails whatever --allow-failures says', async () => {
    fs.rmSync(path.join(directory, 'csp'), { recursive: true });

    expect(await run(undefined, true)).toBe(false);

    expect(updated).toEqual([]);
    expect(shown()).toMatch(/No CSP file found: .*csp\.json does not exist\./);
  });

  test('a file that cannot be read fails whatever --allow-failures says', async () => {
    writeCsp('{ this is not json');

    expect(await run(undefined, true)).toBe(false);

    expect(updated).toEqual([]);
    expect(printError).toHaveBeenCalled();
    expect(summaries()).toHaveLength(0);
  });
});
