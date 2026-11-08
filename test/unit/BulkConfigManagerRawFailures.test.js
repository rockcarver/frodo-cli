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
 * Decision records 0040 and 0041 for `config-manager pull raw` and
 * `config-manager push raw`. When one raw config cannot be exported or
 * imported, the others still run, one summary names it and the cause, and the
 * command fails, unless --allow-failures was given. A list that does not exist
 * or is not a list, a path that matches no file and a config folder without a
 * raw folder fail the command whatever the flag says (record 0041, cli#1112).
 * Standard input is one configuration: the flag has nothing to allow there.
 *
 * Same technique as ConfigManagerDeleteFailures.test.js: the library is a deep
 * stub and every relative import of the module under test is a set of spies,
 * while OperationRun, ErrorCause and the module itself stay real. The files of
 * the config folder are real, in a temporary folder.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const FILE = 'src/configManagerOps/FrConfigRawOps.ts';

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
  constructor(message, original) {
    super(message);
    this.name = 'FrodoError';
    this.original = original;
  }
}
const frodo = deepStub();
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo,
  state: deepStub(),
  FrodoError,
}));

// every relative import of the module under test becomes spies, except the run
// tracker and the cause helper
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
    ) {
      continue;
    }
    const names = mocked.get(target) ?? new Set();
    for (const part of (clause.match(/\{([^}]*)\}/s)?.[1] ?? '').split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0];
      if (name && !part.trim().startsWith('type ')) names.add(name);
    }
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

const { clearOperationalAttributes } = spies.get(
  path.resolve(root, 'src/utils/FrConfig')
);
const { readStdinToEndSync } = spies.get(
  path.resolve(root, 'src/utils/StdinSync')
);
const { stopProgressIndicator } = spies.get(consoleTarget);

// the summary is the one message of the shape "N of M <units> failed"
const SUMMARY = /^\d+ of \d+ [\w ]+ failed/;
const summaries = () =>
  printMessage.mock.calls.filter(([text]) => SUMMARY.test(String(text)));
const summary = () =>
  summaries()
    .map(([text]) => text)
    .join('\n');
const level = () => summaries()[0]?.[1];
const messages = () =>
  printMessage.mock.calls.map(([text]) => String(text)).join('\n');

const PATHS = ['x/a', 'x/b', 'y/c'];

let tmp;
let failing;
let attempted;
let saved;

/** Writes a file below the temporary config folder. */
function put(relative, content) {
  const file = path.join(tmp, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    typeof content === 'string' ? content : JSON.stringify(content)
  );
}
const lastStop = () => stopProgressIndicator.mock.calls.at(-1);

beforeEach(() => {
  jest.clearAllMocks();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-raw-failures-'));
  failing = new Set(['x/b']);
  attempted = [];
  saved = [];
  clearOperationalAttributes.mockReset();
  readStdinToEndSync.mockReset();
  frodo.utils.getFilePath
    .mockReset()
    .mockImplementation((relative) => path.join(tmp, relative));
  frodo.utils.getWorkingDirectory.mockReset().mockReturnValue(tmp);
  frodo.utils.readJsonFile
    .mockReset()
    .mockImplementation((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  frodo.utils.saveJsonToFile.mockReset().mockImplementation((object, file) => {
    saved.push(path.relative(tmp, file));
  });
  frodo.rawConfig.exportRawConfig
    .mockReset()
    .mockImplementation(async (config) => {
      attempted.push(config.path);
      if (!config.path || failing.has(config.path)) {
        throw new Error(`could not export ${config.path}`);
      }
      return { _id: config.path };
    });
  frodo.rawConfig.importRawConfig
    .mockReset()
    .mockImplementation(async ({ path: rawPath }) => {
      attempted.push(rawPath);
      if (failing.has(rawPath)) throw new Error(`could not import ${rawPath}`);
    });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('config-manager pull raw', () => {
  const run = (allowFailures, file = path.join(tmp, 'raw.json')) =>
    ops.configManagerExportRaw(file, allowFailures);

  beforeEach(() => {
    put(
      'raw.json',
      PATHS.map((rawPath) => ({ path: rawPath }))
    );
  });

  test('runs every item after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    expect(attempted).toEqual(PATHS);
    expect(saved).toEqual(['raw/x/a.json', 'raw/y/c.json']);
    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      /^1 of 3 raw configs failed:\n {2}- x\/b: could not export x\/b/
    );
  });

  test('--allow-failures keeps the command successful, still printing the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(attempted).toEqual(PATHS);
    expect(level()).toBe('warn');
    expect(summary()).toContain('x/b');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary when every item is exported', async () => {
    failing = new Set();

    expect(await run()).toBe(true);
    expect(saved).toEqual(['raw/x/a.json', 'raw/x/b.json', 'raw/y/c.json']);
    expect(summaries()).toHaveLength(0);
    expect(printError).not.toHaveBeenCalled();
  });

  test('an item without a path fails on its own and is named by its content', async () => {
    failing = new Set();
    put('raw.json', [{ other: 1 }, { path: 'x/a' }]);

    expect(await run()).toBe(false);
    expect(attempted).toEqual([undefined, 'x/a']);
    expect(summary()).toMatch(
      /^1 of 2 raw configs failed:\n {2}- \{"other":1\}: /
    );
  });

  test('a list that does not exist fails with a plain message, whatever --allow-failures says', async () => {
    const missing = path.join(tmp, 'missing.json');

    expect(await run(true, missing)).toBe(false);
    expect(messages()).toContain(
      `The raw config file '${missing}' does not exist.`
    );
    expect(attempted).toEqual([]);
    expect(printError).not.toHaveBeenCalled();
  });

  test('a file that is not a list fails with a plain message, whatever --allow-failures says', async () => {
    put('raw.json', { path: 'x/a' });

    expect(await run(true)).toBe(false);
    expect(messages()).toContain('must contain a list of items to export');
    expect(attempted).toEqual([]);
  });

  test('a file that is not JSON fails, whatever --allow-failures says', async () => {
    put('raw.json', 'not json');

    expect(await run(true)).toBe(false);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(attempted).toEqual([]);
    expect(summaries()).toHaveLength(0);
  });
});

describe('config-manager push raw', () => {
  const run = (allowFailures, rawPath, stdin = false) =>
    ops.configManagerImportRaw(rawPath, stdin, allowFailures);

  beforeEach(() => {
    for (const rawPath of PATHS) put(`raw/${rawPath}.json`, { _id: rawPath });
    failing = new Set(['/x/b']);
  });

  test('runs every file after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    expect(attempted.sort()).toEqual(['/x/a', '/x/b', '/y/c']);
    expect(clearOperationalAttributes.mock.calls).toHaveLength(3);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      /^1 of 3 raw configs failed:\n {2}- \/x\/b: could not import \/x\/b/
    );
    expect(lastStop().slice(1)).toEqual([
      'Raw config import finished with errors.',
      'fail',
    ]);
  });

  test('--allow-failures keeps the command successful, still printing the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(attempted.sort()).toEqual(['/x/a', '/x/b', '/y/c']);
    expect(level()).toBe('warn');
    expect(summary()).toContain('/x/b');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary when every file is imported', async () => {
    failing = new Set();

    expect(await run()).toBe(true);
    expect(attempted.sort()).toEqual(['/x/a', '/x/b', '/y/c']);
    expect(summaries()).toHaveLength(0);
    expect(printError).not.toHaveBeenCalled();
    expect(lastStop().slice(1)).toEqual([
      'Raw config import completed.',
      'success',
    ]);
  });

  test('a file that is not JSON fails on its own and the others still run', async () => {
    failing = new Set();
    put('raw/x/bad.json', 'not json');

    expect(await run()).toBe(false);
    expect(attempted.sort()).toEqual(['/x/a', '/x/b', '/y/c']);
    expect(summary()).toMatch(/^1 of 4 raw configs failed:\n {2}- \/x\/bad: /);
  });

  test('a path imports only the files below it', async () => {
    failing = new Set();

    expect(await run(false, '/x')).toBe(true);
    expect(attempted.sort()).toEqual(['/x/a', '/x/b']);
  });

  test('a path that matches no file fails the command whatever --allow-failures says', async () => {
    failing = new Set();

    expect(await run(true, '/zzz')).toBe(false);
    expect(attempted).toEqual([]);
    expect(messages()).toContain("matches the path '/zzz'");
    expect(summaries()).toHaveLength(0);
    expect(lastStop().slice(1)).toEqual([
      'Raw config import finished with errors.',
      'fail',
    ]);
  });

  test('a config folder without a raw folder fails with a plain message, whatever --allow-failures says', async () => {
    fs.rmSync(path.join(tmp, 'raw'), { recursive: true });

    expect(await run(true)).toBe(false);
    expect(attempted).toEqual([]);
    expect(lastStop()[1]).toContain(`There is no 'raw' folder in '${tmp}'`);
    expect(lastStop()[2]).toBe('fail');
    // not the file-system error that the missing folder used to surface as
    expect(printError).not.toHaveBeenCalled();
  });

  describe('from standard input', () => {
    test('imports the piped configuration to the given path', async () => {
      readStdinToEndSync.mockReturnValue('{"_id":"s","value":1}');
      failing = new Set();

      expect(await run(false, '/x/s', true)).toBe(true);
      expect(attempted).toEqual(['/x/s']);
      expect(summaries()).toHaveLength(0);
    });

    test('is one configuration: when it fails, the command fails whatever --allow-failures says', async () => {
      readStdinToEndSync.mockReturnValue('{"_id":"s","value":1}');
      failing = new Set(['/x/s']);

      expect(await run(true, '/x/s', true)).toBe(false);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(summaries()).toHaveLength(0);
    });
  });
});
