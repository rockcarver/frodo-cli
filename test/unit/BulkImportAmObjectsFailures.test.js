import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

/**
 * Decision record 0040 for the imports of AM objects: `journey import`,
 * `node import`, `script import`, `theme import`, `email template import` and
 * `service import`, with `-a` (every object of one file) and `-A` (every file
 * of the current directory). When one object (or file) cannot be imported, the
 * others still are, one summary names the failed one, and the command fails,
 * unless --allow-failures was given. A file that the command line names and
 * that cannot be read fails the command whatever the flag says. Nothing to
 * import is not a failure (record 0041).
 *
 * The files are real files in a temporary directory; the library is a deep stub
 * and every relative import of the modules under test is a set of spies, except
 * the run tracker and the journey file reader (the modules themselves stay
 * real).
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
  'src/ops/JourneyOps.ts',
  'src/ops/ScriptOps.ts',
  'src/ops/ThemeOps.ts',
  'src/ops/NodeOps.ts',
  'src/ops/EmailTemplateOps.ts',
  'src/ops/ServiceOps.ts',
];

// every relative import of the modules under test becomes spies, except the
// run tracker, the journey file reader and the modules under test themselves
const modulesUnderTest = new Set(
  FILES.map((file) => path.resolve(root, file).replace(/\.ts$/, ''))
);
const realModules = [
  '/utils/OperationRun',
  '/utils/ErrorCause',
  '/utils/JourneyExportUtils',
];
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
      realModules.some((real) => target.endsWith(real))
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

const modules = {};
for (const file of FILES) {
  modules[file] = await import(path.resolve(root, file));
}

// ---------------------------------------------------------------- fixtures

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-import-test-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
const put = (name, data) =>
  fs.writeFileSync(
    path.join(tmp, name),
    typeof data === 'string' ? data : JSON.stringify(data)
  );
const BROKEN = '{ this is not json';

const IDS = ['a', 'b', 'c', 'd'];
/** The library's HTTP error for one object: only its request URL names the object. */
const httpError = (kind, id) =>
  Object.assign(new Error('Request failed with status code 500'), {
    config: { url: `https://example.com/am/json/${kind}/${id}` },
  });

const summary = () =>
  printMessage.mock.calls
    .map(([text]) => text)
    .filter((text) => /\bfailed:/.test(text))
    .join('\n');
const summaryLevel = () =>
  printMessage.mock.calls.find(([text]) => /\bfailed:/.test(text))?.[1];

let imported;
let exitCodeBefore;
beforeEach(() => {
  jest.clearAllMocks();
  for (const f of fs.readdirSync(tmp)) {
    fs.rmSync(path.join(tmp, f), { recursive: true, force: true });
  }
  imported = [];
  frodo.utils.getFilePath
    .mockReset()
    .mockImplementation((name) =>
      path.isAbsolute(name) ? name : path.join(tmp, name)
    );
  frodo.utils.getWorkingDirectory.mockReset().mockReturnValue(tmp);
  frodo.utils.validateImport.mockReset().mockReturnValue(true);
  exitCodeBefore = process.exitCode;
  process.exitCode = undefined;
});
afterEach(() => {
  process.exitCode = exitCodeBefore;
});

// ------------------------------------------------------------------- cases

/**
 * `fixtures(files)` writes the import files: `files` are the ids that go into
 * them. `arrange(mode)` sets up the library stub; mode `oneFails` makes
 * object `b` fail. The `-a` cases import one named file, the `-A` cases the
 * files of the current directory. `unit` is the plural of what the summary
 * counts, `failedLine` the line for the failed object `b`.
 */
const CASES = [
  {
    name: 'journey import -a',
    all: true,
    file: 'src/ops/JourneyOps.ts',
    fn: 'importJourneysFromFile',
    args: ['all.journey.json', {}],
    fixtures: () =>
      put('all.journey.json', {
        trees: Object.fromEntries(IDS.map((id) => [id, { tree: { _id: id } }])),
      }),
    broken: () => put('all.journey.json', BROKEN),
    unit: 'journeys',
    failedLine: '  - b: could not import b',
    arrange: (mode) => {
      frodo.authn.journey.importJourneys
        .mockReset()
        .mockImplementation(async (data, _options, callback) => {
          if (mode === 'rejected')
            throw new FrodoError('Error validating journeys', [
              new Error('journey b is invalid'),
            ]);
          for (const id of Object.keys(data.trees)) {
            if (mode === 'oneFails' && id === 'b') {
              callback(
                new FrodoError('Error importing the alpha realm journey b', [
                  new Error('could not import b'),
                ])
              );
            } else {
              imported.push(id);
              callback(undefined, { _id: id });
            }
          }
          return [];
        });
    },
  },
  {
    name: 'journey import -A',
    file: 'src/ops/JourneyOps.ts',
    fn: 'importJourneysFromFiles',
    args: [{}],
    fixtures: () => {
      for (const id of IDS)
        put(`${id}.journey.json`, { tree: { _id: id }, nodes: {} });
    },
    broken: () => put('b.journey.json', BROKEN),
    brokenName: 'b.journey.json',
    unit: 'journeys',
    failedLine: '  - b: could not import b',
    arrange: (mode) => {
      frodo.authn.journey.importJourneys
        .mockReset()
        .mockImplementation(async (data, _options, callback) => {
          if (mode === 'rejected')
            throw new FrodoError('Error validating journeys', [
              new Error('journey b is invalid'),
            ]);
          for (const id of Object.keys(data.trees)) {
            if (mode === 'oneFails' && id === 'b') {
              callback(
                new FrodoError('Error importing the alpha realm journey b', [
                  new Error('could not import b'),
                ])
              );
            } else {
              imported.push(id);
              callback(undefined, { _id: id });
            }
          }
          return [];
        });
    },
  },
  {
    name: 'node import -a',
    all: true,
    file: 'src/ops/NodeOps.ts',
    fn: 'importCustomNodesFromFile',
    args: ['all.nodetypes.json', {}],
    fixtures: () =>
      put('all.nodetypes.json', {
        nodeTypes: Object.fromEntries(
          IDS.map((id) => [id, { _id: id, displayName: id, script: 'x' }])
        ),
      }),
    broken: () => put('all.nodetypes.json', BROKEN),
    unit: 'custom nodes',
    failedLine: '  - b: Request failed with status code 500',
    arrange: (mode) => arrangeNodes(mode),
  },
  {
    name: 'node import -A',
    file: 'src/ops/NodeOps.ts',
    fn: 'importCustomNodesFromFiles',
    args: [{}],
    fixtures: () => {
      for (const id of IDS)
        put(`${id}.nodetypes.json`, {
          nodeTypes: { [id]: { _id: id, displayName: id, script: 'x' } },
        });
    },
    broken: () => put('b.nodetypes.json', BROKEN),
    brokenName: 'b.nodetypes.json',
    unit: 'custom nodes',
    failedLine: '  - b: Request failed with status code 500',
    arrange: (mode) => arrangeNodes(mode),
  },
  {
    name: 'script import -f (every script of the file)',
    all: true,
    file: 'src/ops/ScriptOps.ts',
    fn: 'importScriptsFromFile',
    args: ['', '', 'all.script.json', { deps: true, reUuid: false }],
    fixtures: () =>
      put('all.script.json', {
        script: Object.fromEntries(
          IDS.map((id) => [id, { _id: id, name: id, script: ['x'] }])
        ),
      }),
    broken: () => put('all.script.json', BROKEN),
    unit: 'scripts',
    failedLine: '  - b: Request failed with status code 500',
    arrange: (mode) => arrangeScripts(mode),
  },
  {
    name: 'script import -A',
    file: 'src/ops/ScriptOps.ts',
    // watch = false, options, validate
    fn: 'importScriptsFromFiles',
    args: [false, {}, true],
    fixtures: () => {
      for (const id of IDS)
        put(`${id}.script.json`, {
          script: { [id]: { _id: id, name: id, script: ['x'] } },
        });
    },
    broken: () => put('b.script.json', BROKEN),
    brokenName: 'b.script.json',
    unit: 'scripts',
    failedLine: '  - b: Request failed with status code 500',
    arrange: (mode) => arrangeScripts(mode),
  },
  {
    name: 'theme import -A',
    file: 'src/ops/ThemeOps.ts',
    fn: 'importThemesFromFiles',
    args: [],
    fixtures: () => {
      for (const id of IDS)
        put(`${id}.theme.json`, { theme: { [id]: { _id: id, name: id } } });
    },
    broken: () => put('b.theme.json', BROKEN),
    brokenName: 'b.theme.json',
    unit: 'theme files',
    // importThemesFromFile prints the reason itself, the summary names the file
    failedLine: '  - b.theme.json',
    arrange: (mode) => {
      frodo.theme.importThemes.mockReset().mockImplementation(async (data) => {
        const ids = Object.keys(data.theme);
        if (mode === 'oneFails' && ids.includes('b'))
          throw new FrodoError('Error importing alpha realm themes', [
            new Error('could not import b'),
          ]);
        imported.push(...ids);
        return [];
      });
    },
  },
  {
    name: 'email template import -a',
    all: true,
    file: 'src/ops/EmailTemplateOps.ts',
    fn: 'importEmailTemplatesFromFile',
    args: ['all.template.email.json'],
    fixtures: () =>
      put('all.template.email.json', {
        meta: {},
        emailTemplate: Object.fromEntries(IDS.map((id) => [id, { _id: id }])),
      }),
    broken: () => put('all.template.email.json', BROKEN),
    unit: 'email templates',
    failedLine: '  - b: could not update b',
    arrange: (mode) => {
      frodo.email.template.importEmailTemplates
        .mockReset()
        .mockImplementation(async (data) => {
          const ids = Object.keys(data.emailTemplate);
          if (mode === 'oneFails') {
            // the library tries every template and throws one error with one nested error per failure
            imported.push(...ids.filter((id) => id !== 'b'));
            throw new FrodoError('Error importing email templates', [
              new FrodoError('Error updating email template b', [
                new Error('could not update b'),
              ]),
            ]);
          }
          imported.push(...ids);
          return [];
        });
    },
  },
  {
    name: 'email template import -A',
    file: 'src/ops/EmailTemplateOps.ts',
    fn: 'importEmailTemplatesFromFiles',
    args: [false],
    fixtures: () => {
      for (const id of IDS)
        put(`${id}.template.email.json`, {
          meta: {},
          emailTemplate: { [id]: { _id: id } },
        });
    },
    broken: () => put('b.template.email.json', BROKEN),
    brokenName: 'b.template.email.json',
    unit: 'email templates',
    failedLine: '  - b: could not update b',
    arrange: (mode) => {
      frodo.email.template.updateEmailTemplate
        .mockReset()
        .mockImplementation(async (templateId) => {
          if (mode === 'oneFails' && templateId === 'b')
            throw new Error('could not update b');
          imported.push(templateId);
        });
    },
  },
  {
    name: 'service import -a',
    all: true,
    file: 'src/ops/ServiceOps.ts',
    fn: 'importServicesFromFile',
    args: ['all.service.json', {}],
    fixtures: () =>
      put('all.service.json', {
        service: Object.fromEntries(IDS.map((id) => [id, { _id: id }])),
      }),
    broken: () => put('all.service.json', BROKEN),
    unit: 'services',
    failedLine: '  - b: could not put b',
    arrange: (mode) => arrangeServices(mode),
  },
  {
    name: 'service import -A',
    file: 'src/ops/ServiceOps.ts',
    fn: 'importServicesFromFiles',
    args: [{}],
    fixtures: () => {
      for (const id of IDS)
        put(`${id}.service.json`, { service: { [id]: {} } });
    },
    broken: () => put('b.service.json', BROKEN),
    brokenName: 'b.service.json',
    unit: 'services',
    failedLine: '  - b: could not put b',
    arrange: (mode) => arrangeServices(mode),
  },
];

function arrangeNodes(mode) {
  frodo.authn.node.importCustomNodes
    .mockReset()
    .mockImplementation(async (_id, _name, data, _options, callback) => {
      for (const id of Object.keys(data.nodeTypes)) {
        if (mode === 'oneFails' && id === 'b') {
          callback(httpError('node', id));
        } else {
          imported.push(id);
          callback(undefined, { _id: id });
        }
      }
      return [];
    });
}

function arrangeScripts(mode) {
  frodo.script.importScripts
    .mockReset()
    .mockImplementation(
      async (_id, _name, data, _options, _validate, callback) => {
        for (const id of Object.keys(data.script)) {
          if (mode === 'oneFails' && id === 'b') {
            callback(httpError('scripts', id));
          } else {
            imported.push(id);
            callback(undefined, { _id: id });
          }
        }
        return [];
      }
    );
}

function arrangeServices(mode) {
  frodo.service.importServices.mockReset().mockImplementation(async (data) => {
    const ids = Object.keys(data.service);
    imported.push(...ids.filter((id) => !(mode === 'oneFails' && id === 'b')));
    if (mode === 'oneFails' && ids.includes('b')) {
      // the library wraps the failed services twice
      throw new FrodoError('Error importing services', [
        new FrodoError('Error putting alpha realm full service configs', [
          new FrodoError('Error putting alpha realm full service config b', [
            new Error('could not put b'),
          ]),
        ]),
      ]);
    }
    return [];
  });
}

// ------------------------------------------------------------------- tests

describe.each(CASES)('$name', (c) => {
  const run = (allowFailures) =>
    modules[c.file][c.fn](...c.args, allowFailures);
  const total = () => IDS.length;

  test('imports every object after one failed, names it in one summary and fails', async () => {
    c.fixtures();
    c.arrange('oneFails');

    expect(await run()).toBe(false);

    expect([...imported].sort()).toEqual(['a', 'c', 'd']);
    expect(summaryLevel()).toBe('error');
    expect(summary()).toBe(
      `1 of ${total()} ${c.unit} failed:\n${c.failedLine}`
    );
    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalled();
    // the ops function leaves the exit code to its caller (record 0033)
    expect(process.exitCode).toBeUndefined();
  });

  test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
    c.fixtures();
    c.arrange('oneFails');

    expect(await run(true)).toBe(true);

    expect([...imported].sort()).toEqual(['a', 'c', 'd']);
    expect(printError).toHaveBeenCalled();
    expect(summaryLevel()).toBe('warn');
    expect(summary()).toContain(`${c.unit} failed`);
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary and no error when nothing failed', async () => {
    c.fixtures();
    c.arrange('clean');

    expect(await run()).toBe(true);

    expect([...imported].sort()).toEqual(IDS);
    expect(summary()).toBe('');
    expect(printError).not.toHaveBeenCalled();
  });

  if (c.all) {
    test('fails whatever --allow-failures says when the named file cannot be read', async () => {
      c.broken();
      c.arrange('clean');

      expect(await run(true)).toBe(false);

      expect(imported).toEqual([]);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(summary()).toBe(''); // the error is shown once, no summary
    });

    test('fails whatever --allow-failures says when the named file does not exist', async () => {
      c.arrange('clean');

      expect(await run(true)).toBe(false);

      expect(imported).toEqual([]);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(summary()).toBe('');
    });
  } else {
    test('a file that cannot be read is a failed file, named in the summary, and the others are still imported', async () => {
      c.fixtures();
      c.broken();
      c.arrange('clean');

      expect(await run()).toBe(false);

      // the broken file replaced the file of b
      expect([...imported].sort()).toEqual(['a', 'c', 'd']);
      expect(summaryLevel()).toBe('error');
      expect(summary()).toContain(`1 of 4 ${c.unit} failed:`);
      expect(summary()).toContain(c.brokenName);
      expect(printError).toHaveBeenCalled();
      // it is a failed file, not also an unsupported one
      expect(
        printMessage.mock.calls.map(([text]) => text).join('\n')
      ).not.toContain('unsupported');
    });

    test('--allow-failures covers a file that cannot be read', async () => {
      c.fixtures();
      c.broken();
      c.arrange('clean');

      expect(await run(true)).toBe(true);

      expect([...imported].sort()).toEqual(['a', 'c', 'd']);
      expect(summaryLevel()).toBe('warn');
      expect(summary()).toContain(c.brokenName);
    });

    test('nothing to import is not a failure (record 0041)', async () => {
      c.arrange('clean');

      expect(await run()).toBe(true);

      expect(imported).toEqual([]);
      expect(summary()).toBe('');
      expect(printError).not.toHaveBeenCalled();
    });
  }
});

describe('journey import: a batch that the library rejects as a whole', () => {
  const [all, separate] = CASES;

  test.each([all, separate])(
    '$name: ends the command whatever --allow-failures says, with the error shown once and no summary',
    async (c) => {
      c.fixtures();
      c.arrange('rejected');

      expect(await modules[c.file][c.fn](...c.args, true)).toBe(false);

      expect(printError).toHaveBeenCalledTimes(1);
      expect(summary()).toBe('');
    }
  );

  test('-A: no valid journey file says so and succeeds', async () => {
    put('other.journey.json', { something: 'else' });
    separate.arrange('clean');

    expect(await modules[separate.file][separate.fn]({})).toBe(true);

    expect(frodo.authn.journey.importJourneys.mock.calls).toHaveLength(0);
    expect(printMessage.mock.calls.map(([text]) => text).join('\n')).toContain(
      'No valid journeys found in'
    );
    expect(printError).not.toHaveBeenCalled();
  });

  test('-A: a file that cannot be read next to no valid journey is the failure', async () => {
    put('b.journey.json', BROKEN);
    separate.arrange('clean');

    expect(await modules[separate.file][separate.fn]({})).toBe(false);

    expect(summary()).toContain('1 of 1 journey failed:');
    expect(summary()).toContain('b.journey.json');
  });
});

describe('script import -A', () => {
  const c = CASES.find((it) => it.name === 'script import -A');

  test('resolves only when every file has been imported', async () => {
    c.fixtures();
    // each import takes a while: the function must wait for all of them
    frodo.script.importScripts
      .mockReset()
      .mockImplementation(
        async (_id, _name, data, _options, _validate, callback) => {
          await new Promise((resolve) => setTimeout(resolve, 150));
          for (const id of Object.keys(data.script)) {
            imported.push(id);
            callback(undefined, { _id: id });
          }
          return [];
        }
      );

    expect(await modules[c.file][c.fn](...c.args)).toBe(true);

    expect([...imported].sort()).toEqual(IDS);
  });

  test('a file that fails as a whole is a failed file', async () => {
    c.fixtures();
    frodo.script.importScripts
      .mockReset()
      .mockImplementation(
        async (_id, _name, data, _options, _validate, callback) => {
          if (data.script.c) throw new Error('validation failed for c');
          for (const id of Object.keys(data.script)) {
            imported.push(id);
            callback(undefined, { _id: id });
          }
          return [];
        }
      );

    expect(await modules[c.file][c.fn](...c.args)).toBe(false);

    expect([...imported].sort()).toEqual(['a', 'b', 'd']);
    expect(summary()).toContain('1 of 4 scripts failed:');
    expect(summary()).toContain('c.script.json: validation failed for c');
  });

  test('--script-id and --script-name still import one script of a file', async () => {
    put('all.script.json', {
      script: Object.fromEntries(
        IDS.map((id) => [id, { _id: id, name: id, script: ['x'] }])
      ),
    });
    arrangeScripts('clean');

    expect(
      await modules['src/ops/ScriptOps.ts'].importScriptsFromFile(
        'b',
        '',
        'all.script.json'
      )
    ).toBe(true);

    expect(frodo.script.importScripts.mock.calls[0][0]).toBe('b');
  });
});

describe('theme import -a', () => {
  const importThemesFromFile = (file) =>
    modules['src/ops/ThemeOps.ts'].importThemesFromFile(file);

  test('is one operation: the library imports the themes of the file together', async () => {
    put('all.theme.json', {
      theme: Object.fromEntries(IDS.map((id) => [id, { _id: id, name: id }])),
    });
    frodo.theme.importThemes.mockReset().mockResolvedValue([]);

    expect(await importThemesFromFile('all.theme.json')).toBe(true);
    expect(summary()).toBe('');
  });

  test('fails when the library fails, and when the file cannot be read', async () => {
    put('all.theme.json', { theme: { a: { _id: 'a', name: 'a' } } });
    frodo.theme.importThemes
      .mockReset()
      .mockRejectedValue(new FrodoError('Error importing themes'));
    expect(await importThemesFromFile('all.theme.json')).toBe(false);

    put('broken.theme.json', BROKEN);
    expect(await importThemesFromFile('broken.theme.json')).toBe(false);
  });
});

describe('single imports do not swallow', () => {
  test('node import -i: a node that is not in the file is a failure', async () => {
    put('all.nodetypes.json', {
      nodeTypes: { a: { _id: 'a', displayName: 'a', script: 'x' } },
    });
    // the library imports nothing that does not match
    frodo.authn.node.importCustomNodes.mockReset().mockResolvedValue([]);

    expect(
      await modules['src/ops/NodeOps.ts'].importCustomNodeFromFile(
        'zzz',
        undefined,
        'all.nodetypes.json',
        {}
      )
    ).toBe(false);
  });

  test('node import -i: a failure reported by the library is a failure', async () => {
    put('all.nodetypes.json', {
      nodeTypes: { a: { _id: 'a', displayName: 'a', script: 'x' } },
    });
    frodo.authn.node.importCustomNodes
      .mockReset()
      .mockImplementation(async (_id, _name, _data, _options, callback) => {
        callback(httpError('node', 'a'));
        return [];
      });

    expect(
      await modules['src/ops/NodeOps.ts'].importCustomNodeFromFile(
        'a',
        undefined,
        'all.nodetypes.json',
        {}
      )
    ).toBe(false);
    expect(printError).toHaveBeenCalledTimes(1);
  });

  test('node import: the first node of a file whose import fails is a failure', async () => {
    put('all.nodetypes.json', {
      nodeTypes: { a: { _id: 'a', displayName: 'a', script: 'x' } },
    });
    frodo.authn.node.importCustomNodes
      .mockReset()
      .mockImplementation(async (_id, _name, _data, _options, callback) => {
        callback(httpError('node', 'a'));
        return [];
      });

    expect(
      await modules['src/ops/NodeOps.ts'].importFirstCustomNodeFromFile(
        'all.nodetypes.json',
        {}
      )
    ).toBe(false);
  });

  test('service import -i: a service that is not in the file is a failure', async () => {
    put('all.service.json', { service: { a: {} } });
    frodo.service.importService.mockReset().mockResolvedValue({});

    expect(
      await modules['src/ops/ServiceOps.ts'].importServiceFromFile(
        'zzz',
        'all.service.json',
        {}
      )
    ).toBe(false);
    expect(frodo.service.importService.mock.calls).toHaveLength(0);
  });

  test('service import: a file without a service is a failure', async () => {
    put('empty.service.json', { service: {} });

    expect(
      await modules['src/ops/ServiceOps.ts'].importFirstServiceFromFile(
        'empty.service.json',
        {}
      )
    ).toBe(false);
  });

  test('service import -i: a service that is in the file is imported', async () => {
    put('all.service.json', { service: { a: {} } });
    frodo.service.importService.mockReset().mockResolvedValue({});

    expect(
      await modules['src/ops/ServiceOps.ts'].importServiceFromFile(
        'a',
        'all.service.json',
        {}
      )
    ).toBe(true);
  });
});

describe('email template import -A: a file that fails validation', () => {
  test('is a failed file, named in the summary, and the others are still imported', async () => {
    for (const id of IDS)
      put(`${id}.template.email.json`, {
        meta: { id },
        emailTemplate: { [id]: { _id: id } },
      });
    frodo.utils.validateImport
      .mockReset()
      .mockImplementation((meta) => meta.id !== 'c');
    frodo.email.template.updateEmailTemplate
      .mockReset()
      .mockImplementation(async (templateId) => {
        imported.push(templateId);
      });

    expect(
      await modules[
        'src/ops/EmailTemplateOps.ts'
      ].importEmailTemplatesFromFiles(false)
    ).toBe(false);

    expect([...imported].sort()).toEqual(['a', 'b', 'd']);
    expect(summary()).toContain('1 of 4 email templates failed:');
    expect(summary()).toContain('c.template.email.json: validation failed');
  });
});
