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
 * Decision records 0040 and 0041 for `config-manager pull` and `push` of
 * `iga-workflows`, `locales`, `schedules`, `services` and `telemetry`. When one
 * item fails, the others still run, one summary names the failed one, and the
 * command fails, unless --allow-failures was given. A failure to read what
 * there is to export or import fails the command whatever the flag says.
 * Nothing to do, when no item was named, is a success; a named item that is not
 * there, and a folder to push from that is not there, are failures with a plain
 * message. A file of a push that cannot be parsed is a failed item.
 *
 * Same technique as ConfigManagerDeleteFailures.test.js: the library is a deep
 * stub and every relative import of the modules under test is a set of spies,
 * while OperationRun, ErrorCause and the modules themselves stay real. The files
 * of a push are real files in a temporary folder.
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
const nameOf = (id) => id;

/** The temporary folder that is the working directory of the current test. */
let tmp;
function write(file, data) {
  const target = path.join(tmp, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    typeof data === 'string' ? data : JSON.stringify(data)
  );
}

/** What the library throws when it cannot update a config entity. */
const entityError = (id, name) =>
  new FrodoError(
    `Error updating config entity ${id}`,
    new Error(`could not import ${name}`)
  );

/**
 * `importConfigEntities` of the library: it tries every entity and reports each
 * one to the result callback.
 */
function importEntities({ failing, attempted, prefix }) {
  frodo.idm.config.importConfigEntities
    .mockReset()
    .mockImplementation(async (data, entityId, options, callback) => {
      for (const id of Object.keys(data.idm)) {
        const name = id.replace(`${prefix}/`, '');
        attempted.push(name);
        if (failing.has(name)) callback(entityError(id, name), undefined);
        else callback(undefined, { _id: id });
      }
      return [];
    });
}

/**
 * Every case arranges the stubs and the files so that the items `a`, `b` and
 * `c` exist and the ones in `failing` cannot be exported or imported.
 * `attempted` collects what was tried. `run(module, allowFailures)` calls the
 * function under test for all items.
 *
 * - `reason(id)`: the reason the summary gives for the failed item
 * - `empty()`: arranges that there is nothing to do
 * - `failToRead()`: arranges that what there is to export or import cannot be read
 * - `notFound(module)`: runs the function for an item that is not there
 * - `runNamed(module)`: runs the function for the item `b`
 * - push only: `folder` (and `folderMessage`) of the files, `fileOf(id)` (the
 *   file of an item) and `unreadableName(id)` (what the summary calls the item
 *   once its file cannot be parsed)
 */
const CASES = [
  {
    name: 'config-manager pull locales',
    file: 'src/configManagerOps/FrConfigLocalesOps.ts',
    summaryName: nameOf,
    unit: 'locale',
    reason: (id) => `could not save ${id}`,
    arrange({ failing, attempted }) {
      frodo.idm.config.readConfigEntitiesByType
        .mockReset()
        .mockResolvedValue(IDS.map((id) => ({ _id: `uilocale/${id}` })));
      frodo.utils.saveJsonToFile.mockImplementation((data) => {
        const id = data._id.split('/')[1];
        attempted.push(id);
        if (failing.has(id)) throw new Error(`could not save ${id}`);
      });
    },
    empty: () =>
      frodo.idm.config.readConfigEntitiesByType
        .mockReset()
        .mockResolvedValue([]),
    emptyMessage: /No locales found to export\./,
    failToRead: () =>
      frodo.idm.config.readConfigEntitiesByType
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    notFound: (m) => m.configManagerExportLocales('zzz', false),
    runNamed: (m) => m.configManagerExportLocales('b', false),
    run: (m, allowFailures) =>
      m.configManagerExportLocales(undefined, allowFailures),
  },
  {
    name: 'config-manager push locales',
    file: 'src/configManagerOps/FrConfigLocalesOps.ts',
    summaryName: nameOf,
    unit: 'locale',
    reason: (id) => `could not import ${id}`,
    arrange({ failing, attempted }) {
      for (const id of IDS)
        write(`locales/${id}.json`, { _id: `uilocale/${id}` });
      importEntities({ failing, attempted, prefix: 'uilocale' });
    },
    folder: 'locales',
    folderMessage: /Locales folder not found: .*locales/,
    fileOf: (id) => `locales/${id}.json`,
    unreadableName: (id) => `${id}.json`,
    empty: () => fs.mkdirSync(path.join(tmp, 'locales')),
    emptyMessage: /No locales found to import in .*locales/,
    failToRead: () => write('locales', 'not a folder'),
    notFound: (m) => m.configManagerImportLocales('zzz', false),
    runNamed: (m) => m.configManagerImportLocales('b', false),
    run: (m, allowFailures) =>
      m.configManagerImportLocales(undefined, allowFailures),
  },
  {
    name: 'config-manager pull schedules',
    file: 'src/configManagerOps/FrConfigSchedulesOps.ts',
    summaryName: nameOf,
    unit: 'schedule',
    reason: (id) => `could not save ${id}`,
    arrange({ failing, attempted }) {
      frodo.idm.config.readConfigEntitiesByType
        .mockReset()
        // the scheduler service is no schedule
        .mockResolvedValue([
          { _id: 'scheduler' },
          ...IDS.map((id) => ({ _id: `schedule/${id}`, invokeService: 'x' })),
        ]);
      frodo.utils.saveJsonToFile.mockImplementation((data) => {
        const id = data._id.split('/')[1];
        attempted.push(id);
        if (failing.has(id)) throw new Error(`could not save ${id}`);
      });
    },
    empty: () =>
      frodo.idm.config.readConfigEntitiesByType
        .mockReset()
        .mockResolvedValue([{ _id: 'scheduler' }]),
    emptyMessage: /No schedules found to export\./,
    failToRead: () =>
      frodo.idm.config.readConfigEntitiesByType
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    notFound: (m) => m.configManagerExportSchedules('zzz', false),
    runNamed: (m) => m.configManagerExportSchedules('b', false),
    run: (m, allowFailures) =>
      m.configManagerExportSchedules(undefined, allowFailures),
  },
  {
    name: 'config-manager push schedules',
    file: 'src/configManagerOps/FrConfigSchedulesOps.ts',
    summaryName: nameOf,
    unit: 'schedule',
    reason: (id) => `could not import ${id}`,
    arrange({ failing, attempted }) {
      for (const id of IDS) {
        write(`schedules/${id}/${id}.json`, {
          _id: `schedule/${id}`,
          invokeService: 'x',
        });
      }
      importEntities({ failing, attempted, prefix: 'schedule' });
    },
    folder: 'schedules',
    folderMessage: /Schedules folder not found: .*schedules/,
    fileOf: (id) => `schedules/${id}/${id}.json`,
    unreadableName: nameOf,
    empty: () => fs.mkdirSync(path.join(tmp, 'schedules')),
    emptyMessage: /No schedules found to import in .*schedules/,
    failToRead: () => write('schedules', 'not a folder'),
    notFound: (m) => m.configManagerImportSchedules('zzz', undefined, false),
    runNamed: (m) => m.configManagerImportSchedules('b', undefined, false),
    run: (m, allowFailures) =>
      m.configManagerImportSchedules(undefined, undefined, allowFailures),
  },
  {
    name: 'config-manager pull iga-workflows',
    file: 'src/configManagerOps/FrConfigIgaWorkflowsOps.ts',
    summaryName: nameOf,
    unit: 'workflow',
    reason: (id) => `could not save ${id}`,
    arrange({ failing, attempted, spy }) {
      spy('src/utils/FrConfig')
        .safeFileName.mockReset()
        .mockImplementation((name) => name);
      frodo.cloud.iga.workflow.readWorkflows.mockReset().mockResolvedValue(
        IDS.map((id) => ({
          id: `id-${id}`,
          name: id,
          mutable: true,
          steps: [],
        }))
      );
      frodo.utils.saveJsonToFile.mockImplementation((data) => {
        attempted.push(data.name);
        if (failing.has(data.name))
          throw new Error(`could not save ${data.name}`);
      });
    },
    empty: () =>
      frodo.cloud.iga.workflow.readWorkflows.mockReset().mockResolvedValue([]),
    emptyMessage: /No workflows found to export\./,
    failToRead: () =>
      frodo.cloud.iga.workflow.readWorkflows
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    notFound: (m) => m.configManagerExportIgaWorkflows('zzz', false, false),
    runNamed: (m) => m.configManagerExportIgaWorkflows('b', false, false),
    run: (m, allowFailures) =>
      m.configManagerExportIgaWorkflows(undefined, false, allowFailures),
  },
  {
    name: 'config-manager push iga-workflows',
    file: 'src/configManagerOps/FrConfigIgaWorkflowsOps.ts',
    summaryName: nameOf,
    unit: 'workflow',
    reason: (id) => `could not import ${id}`,
    arrange({ failing, attempted }) {
      for (const id of IDS) {
        write(`iga/workflows/${id}/${id}.json`, {
          id: `id-${id}`,
          name: id,
          mutable: true,
        });
      }
      frodo.cloud.iga.workflow.updateWorkflow
        .mockReset()
        .mockImplementation(async (workflowId) => {
          const name = workflowId.replace(/^id-/, '');
          attempted.push(name);
          if (failing.has(name)) throw new Error(`could not import ${name}`);
        });
    },
    folder: 'iga/workflows',
    folderMessage: /IGA workflows folder not found: .*iga\/workflows/,
    fileOf: (id) => `iga/workflows/${id}/${id}.json`,
    unreadableName: nameOf,
    empty: () =>
      fs.mkdirSync(path.join(tmp, 'iga/workflows'), { recursive: true }),
    emptyMessage: /No workflows found to import in .*iga\/workflows/,
    failToRead: () => write('iga/workflows', 'not a folder'),
    notFound: (m) => m.configManagerImportIgaWorkflows('zzz', false, false),
    runNamed: (m) => m.configManagerImportIgaWorkflows('b', false, false),
    run: (m, allowFailures) =>
      m.configManagerImportIgaWorkflows(undefined, false, allowFailures),
  },
  {
    name: 'config-manager pull services',
    file: 'src/configManagerOps/FrConfigServiceOps.ts',
    summaryName: (id) => `alpha/${id}`,
    unit: 'service',
    reason: (id) => `could not save ${id}`,
    arrange({ failing, attempted, spy }) {
      spy('src/utils/FrConfig')
        .realmList.mockReset()
        .mockResolvedValue(['alpha']);
      frodo.service.getFullServices
        .mockReset()
        .mockResolvedValue(
          IDS.map((id) => ({ _type: { _id: id }, nextDescendents: [] }))
        );
      frodo.utils.saveJsonToFile.mockImplementation((data) => {
        const id = data._type._id;
        attempted.push(id);
        if (failing.has(id)) throw new Error(`could not save ${id}`);
      });
    },
    empty: () =>
      frodo.service.getFullServices.mockReset().mockResolvedValue([]),
    emptyMessage: /No services found to export\./,
    failToRead: ({ spy }) =>
      spy('src/utils/FrConfig')
        .realmList.mockReset()
        .mockRejectedValue(new Error('read failed')),
    notFound: (m) => m.configManagerExportServices(undefined, 'zzz', false),
    runNamed: (m) => m.configManagerExportServices(undefined, 'b', false),
    run: (m, allowFailures) =>
      m.configManagerExportServices(undefined, undefined, allowFailures),
  },
  {
    name: 'config-manager push services',
    file: 'src/configManagerOps/FrConfigServiceOps.ts',
    summaryName: (id) => `alpha/${id}`,
    unit: 'service',
    reason: (id) => `could not import ${id}`,
    arrange({ failing, attempted }) {
      for (const id of IDS) {
        write(`realms/alpha/services/${id}.json`, { _type: { _id: id } });
      }
      // the library tries every service of the realm and throws one error
      // that carries one nested error per service, wrapped twice
      frodo.service.importServices
        .mockReset()
        .mockImplementation(async (data) => {
          const errors = [];
          for (const id of Object.keys(data.service)) {
            attempted.push(id);
            if (failing.has(id)) {
              errors.push(
                new FrodoError(
                  `Error putting full service config ${id}`,
                  new Error(`could not import ${id}`)
                )
              );
            }
          }
          if (errors.length > 0) {
            throw new FrodoError(
              'Error importing services',
              new FrodoError(
                'Error putting alpha realm full service configs',
                errors
              )
            );
          }
          return [];
        });
    },
    folder: 'realms',
    folderMessage: /Realms folder not found: .*realms/,
    fileOf: (id) => `realms/alpha/services/${id}.json`,
    unreadableName: (id) => `alpha/${id}`,
    empty: () =>
      fs.mkdirSync(path.join(tmp, 'realms/alpha'), { recursive: true }),
    emptyMessage: /No services found to import in .*realms/,
    failToRead: () => write('realms', 'not a folder'),
    notFound: (m) => m.configManagerImportServices('zzz', undefined, false),
    runNamed: (m) => m.configManagerImportServices('b', undefined, false),
    run: (m, allowFailures) =>
      m.configManagerImportServices(undefined, undefined, allowFailures),
  },
  {
    name: 'config-manager pull telemetry',
    file: 'src/configManagerOps/FrConfigTelemetryOps.ts',
    summaryName: (id) => `otlp/${id}`,
    unit: 'telemetry exporter',
    reason: (id) => `could not save ${id}`,
    arrange({ failing, attempted }) {
      // the library filters by name
      frodo.cloud.telemetry.exportTelemetry
        .mockReset()
        .mockImplementation(async (name) => ({
          telemetry: {
            otlp: IDS.filter((id) => !name || id === name).map((id) => ({
              id,
            })),
          },
        }));
      frodo.utils.saveJsonToFile.mockImplementation((data) => {
        attempted.push(data.id);
        if (failing.has(data.id)) throw new Error(`could not save ${data.id}`);
      });
    },
    empty: () =>
      frodo.cloud.telemetry.exportTelemetry
        .mockReset()
        .mockResolvedValue({ telemetry: { otlp: [] } }),
    emptyMessage: /No telemetry exporters found to export\./,
    failToRead: () =>
      frodo.cloud.telemetry.exportTelemetry
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    notFound: (m) => m.configManagerExportTelemetry(undefined, 'zzz', false),
    runNamed: (m) => m.configManagerExportTelemetry(undefined, 'b', false),
    run: (m, allowFailures) =>
      m.configManagerExportTelemetry(undefined, undefined, allowFailures),
  },
  {
    name: 'config-manager push telemetry',
    file: 'src/configManagerOps/FrConfigTelemetryOps.ts',
    summaryName: (id) => `otlp/${id}`,
    unit: 'telemetry exporter',
    reason: (id) => `could not import ${id}`,
    arrange({ failing, attempted }) {
      for (const id of IDS) write(`telemetry/otlp/${id}.json`, { id });
      // the library stops at the first exporter it cannot import
      frodo.cloud.telemetry.importTelemetry
        .mockReset()
        .mockImplementation(async (data) => {
          const id = data.telemetry.otlp[0].id;
          attempted.push(id);
          if (failing.has(id)) {
            throw new FrodoError(
              'Error importing telemetry exporters',
              new Error(`could not import ${id}`)
            );
          }
        });
    },
    folder: 'telemetry',
    folderMessage: /Telemetry folder not found: .*telemetry/,
    fileOf: (id) => `telemetry/otlp/${id}.json`,
    unreadableName: (id) => `otlp/${id}.json`,
    empty: () => fs.mkdirSync(path.join(tmp, 'telemetry')),
    emptyMessage: /No telemetry exporters found to import/,
    failToRead: () => write('telemetry', 'not a folder'),
    notFound: (m) => m.configManagerImportTelemetry(undefined, 'zzz', false),
    runNamed: (m) => m.configManagerImportTelemetry(undefined, 'b', false),
    run: (m, allowFailures) =>
      m.configManagerImportTelemetry(undefined, undefined, allowFailures),
  },
];

// every relative import of the modules under test becomes spies, except the
// run tracker, the cause helper and the modules under test themselves (the
// services module reuses the error helpers of the service ops)
const FILES = [...new Set(CASES.map((c) => c.file)), 'src/ops/ServiceOps.ts'];
const modulesUnderTest = new Set(
  FILES.map((file) => path.resolve(root, file).replace(/\.ts$/, ''))
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
const { printError, printMessage, stopProgressIndicator } =
  spies.get(consoleTarget);
const spy = (file) => spies.get(path.resolve(root, file));

const modules = {};
for (const { file } of CASES) {
  modules[file] ??= await import(path.resolve(root, file));
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
/** Everything the command said, also through the progress indicator. */
const said = () =>
  [
    ...printMessage.mock.calls.map(([text]) => String(text)),
    ...stopProgressIndicator.mock.calls.map(([, text]) => String(text)),
  ].join('\n');
const escaped = (text) => text.replace(/[/.]/g, '\\$&');

describe.each(CASES)('$name', (c) => {
  let attempted;
  let failing;
  const ctx = () => ({ failing, attempted, spy });

  beforeEach(() => {
    jest.clearAllMocks();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm4-'));
    frodo.utils.getFilePath
      .mockReset()
      .mockImplementation((file) => path.join(tmp, file));
    frodo.utils.getWorkingDirectory.mockReset().mockReturnValue(tmp);
    frodo.utils.readJsonFile
      .mockReset()
      .mockImplementation((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
    frodo.utils.saveJsonToFile.mockReset();
    attempted = [];
    failing = new Set(['b']);
    c.arrange(ctx());
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const run = (allowFailures) => c.run(modules[c.file], allowFailures);
  const tried = () => [...attempted].sort();
  // the push cases arranged the files of the items: start from no folder
  const clearFolder = () => {
    if (c.folder) {
      fs.rmSync(path.join(tmp, c.folder), { recursive: true, force: true });
    }
  };

  test('runs every item after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    expect(tried()).toEqual(IDS);
    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalled();
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      new RegExp(
        `^1 of 3 ${c.unit}s failed:\\n {2}- ${escaped(c.summaryName('b'))}: ${c.reason('b')}`
      )
    );
  });

  test('--allow-failures keeps the command successful, still printing the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(tried()).toEqual(IDS);
    expect(level()).toBe('warn');
    expect(summary()).toContain(c.summaryName('b'));
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary when every item succeeds', async () => {
    failing = new Set();
    c.arrange(ctx());

    expect(await run()).toBe(true);
    expect(tried()).toEqual(IDS);
    expect(summaries()).toHaveLength(0);
    expect(printError).not.toHaveBeenCalled();
  });

  test('fails whatever --allow-failures says when it cannot read what there is to do', async () => {
    clearFolder();
    c.failToRead(ctx());

    expect(await run(true)).toBe(false);
    expect(printError).toHaveBeenCalled();
    expect(summaries()).toHaveLength(0); // the error is shown once, no summary
  });

  test('nothing to do is a success with a message that says so', async () => {
    clearFolder();
    c.empty(ctx());

    expect(await run()).toBe(true);
    expect(printError).not.toHaveBeenCalled();
    expect(summaries()).toHaveLength(0);
    expect(said()).toMatch(c.emptyMessage);
  });

  test('a named item that is not there fails the command and does nothing', async () => {
    expect(await c.notFound(modules[c.file])).toBe(false);

    expect(attempted).toEqual([]);
    expect(printError).not.toHaveBeenCalled(); // a plain message, not an error
    expect(said()).toMatch(/zzz/);
  });

  test('a named item is the only one that is tried', async () => {
    failing = new Set();
    c.arrange(ctx());

    expect(await c.runNamed(modules[c.file])).toBe(true);
    expect(attempted).toEqual(['b']);
    expect(summaries()).toHaveLength(0);
  });

  if (c.folder) {
    test('a folder to push from that is not there fails with a plain message', async () => {
      fs.rmSync(path.join(tmp, c.folder), { recursive: true, force: true });

      expect(await run(true)).toBe(false);

      expect(attempted).toEqual([]);
      expect(printError).not.toHaveBeenCalled();
      expect(said()).toMatch(c.folderMessage);
    });

    test('a file that cannot be parsed is a failed item and the others are still imported', async () => {
      write(c.fileOf('b'), '{ not json');

      expect(await run()).toBe(false);

      expect(tried()).toEqual(['a', 'c']);
      expect(printError).toHaveBeenCalled();
      expect(summaries()).toHaveLength(1);
      expect(summary()).toMatch(
        new RegExp(
          `^1 of 3 ${c.unit}s failed:\\n {2}- ${escaped(c.unreadableName('b'))}: `
        )
      );
    });

    test('names every item when none of the files can be parsed', async () => {
      for (const id of IDS) write(c.fileOf(id), '{ not json');

      expect(await run(true)).toBe(true); // --allow-failures
      expect(attempted).toEqual([]);
      expect(summary()).toMatch(new RegExp(`^3 of 3 ${c.unit}s failed:`));
      expect(level()).toBe('warn');

      printMessage.mockClear();
      expect(await run()).toBe(false);
      for (const id of IDS) expect(summary()).toContain(c.unreadableName(id));
      expect(level()).toBe('error');
    });
  }
});

describe('config-manager pull services: a realm whose services cannot be read', () => {
  const { configManagerExportServices } =
    modules['src/configManagerOps/FrConfigServiceOps.ts'];
  let saved;

  beforeEach(() => {
    jest.clearAllMocks();
    saved = [];
    frodo.utils.getFilePath.mockReset().mockImplementation((file) => file);
    frodo.utils.saveJsonToFile.mockReset().mockImplementation((data) => {
      saved.push(data._type._id);
    });
    spy('src/utils/FrConfig')
      .realmList.mockReset()
      .mockResolvedValue(['alpha', 'bravo']);
  });

  const unreadable = (...ids) =>
    new FrodoError(
      `Error getting alpha realm full service configs: ${ids.join('; ')}`,
      ids.map(
        (id) =>
          new FrodoError(
            `Unable to retrieve data for service '${id}'`,
            new Error(`could not read ${id}`)
          )
      )
    );

  test('names each service the library could not read, with its realm, and still exports the other realm', async () => {
    frodo.service.getFullServices
      .mockReset()
      .mockRejectedValueOnce(unreadable('x', 'y'))
      .mockResolvedValueOnce([{ _type: { _id: 'z' }, nextDescendents: [] }]);

    expect(await configManagerExportServices(undefined, undefined, false)).toBe(
      false
    );

    expect(saved).toEqual(['z']);
    expect(summaries()).toHaveLength(1);
    expect(summary()).toMatch(
      /^2 of 3 services failed:\n {2}- alpha\/x: could not read x\n {2}- alpha\/y: could not read y/
    );
  });

  test('a realm whose services cannot even be listed is one failure named after the realm', async () => {
    frodo.service.getFullServices
      .mockReset()
      .mockRejectedValueOnce(
        new FrodoError(
          'Error getting alpha realm full service configs',
          new Error('list failed')
        )
      )
      .mockResolvedValueOnce([{ _type: { _id: 'z' }, nextDescendents: [] }]);

    expect(await configManagerExportServices(undefined, undefined, true)).toBe(
      true
    );

    expect(saved).toEqual(['z']);
    expect(summary()).toMatch(
      /^1 of 2 services failed:\n {2}- realm alpha: list failed/
    );
    expect(level()).toBe('warn');
  });

  test('a run in which nothing could be read is a failure, not "no services"', async () => {
    spy('src/utils/FrConfig')
      .realmList.mockReset()
      .mockResolvedValue(['alpha']);
    frodo.service.getFullServices
      .mockReset()
      .mockRejectedValue(unreadable('x'));

    expect(await configManagerExportServices(undefined, undefined, false)).toBe(
      false
    );

    expect(saved).toEqual([]);
    expect(summary()).toMatch(/^1 of 1 service failed:\n {2}- alpha\/x: /);
    expect(printMessage).not.toHaveBeenCalledWith(
      'No services found to export.'
    );
  });
});
