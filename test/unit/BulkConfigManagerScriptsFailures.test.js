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
 * Decision records 0040 and 0041 for `config-manager pull scripts` and
 * `config-manager push scripts`. When one script (or the scripts of one realm)
 * cannot be exported or imported, the others still run, one summary names it
 * and the cause, and the command fails, unless --allow-failures was given. A
 * named script that is nowhere, a named realm without script config and a
 * config folder without a realms folder fail the command whatever the flag
 * says (record 0041, cli#1112); a realm folder without script config is only
 * skipped, with a warning that names it.
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
const FILE = 'src/configManagerOps/FrConfigScriptOps.ts';

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

const frodo = deepStub();
const state = deepStub();
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({ frodo, state }));

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
const { realmList } = spies.get(path.resolve(root, 'src/utils/FrConfig'));

const ops = await import(path.resolve(root, FILE));

const { fileFilter, safeFileName } = spies.get(
  path.resolve(root, 'src/utils/FrConfig')
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

const IDS = ['a', 'b', 'c'];
const SCRIPTS = IDS.map((id) => ({
  _id: `id-${id}`,
  name: id,
  language: 'JAVASCRIPT',
  context: 'CTX',
  script: 'Y29kZQ==',
}));
const configFile = (id, realm = 'alpha') =>
  `realms/${realm}/scripts/scripts-config/id-${id}.json`;

let tmp;
let failing;
let attempted;
let current;

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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-scripts-failures-'));
  failing = new Set(['b']);
  attempted = [];
  current = undefined;
  state.setRealm.mockReset().mockImplementation((realm) => {
    current = realm;
  });
  fileFilter.mockReset().mockReturnValue(true);
  safeFileName.mockReset().mockImplementation((name) => name);
  realmList.mockReset().mockResolvedValue(['alpha', 'bravo']);
  frodo.utils.getFilePath
    .mockReset()
    .mockImplementation((relative) => path.join(tmp, relative));
  frodo.utils.getWorkingDirectory.mockReset().mockReturnValue(tmp);
  frodo.utils.readJsonFile
    .mockReset()
    .mockImplementation((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  frodo.utils.decodeBase64.mockReset().mockReturnValue('code');
  frodo.utils.saveJsonToFile.mockReset();
  // export: a script is written as a config file and a content file
  frodo.utils.saveTextToFile.mockReset().mockImplementation((_text, file) => {
    const name = path.basename(file, '.js');
    attempted.push(name);
    if (failing.has(name)) throw new Error(`could not write ${name}`);
  });
  frodo.script.readScripts.mockReset().mockImplementation(async () => {
    if (failing.has(`read ${current}`)) throw new Error('read failed');
    return SCRIPTS;
  });
  frodo.script.readScriptByName.mockReset().mockImplementation(async (name) => {
    const script = SCRIPTS.find((s) => s.name === name);
    if (!script) throw new Error(`Script ${name} not found`);
    return script;
  });
  // import: a script is updated by its id
  frodo.script.updateScript
    .mockReset()
    .mockImplementation(async (_id, data) => {
      attempted.push(data.name);
      if (failing.has(data.name))
        throw new Error(`could not update ${data.name}`);
      return { name: data.name };
    });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('config-manager pull scripts', () => {
  const run = (allowFailures, { prefixes, realm = 'alpha', name } = {}) =>
    ops.configManagerExportScripts(prefixes, realm, name, allowFailures);

  test('runs every script after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    expect(attempted).toEqual(IDS);
    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      /^1 of 3 scripts failed:\n {2}- b in realm alpha: could not write b/
    );
    expect(lastStop().slice(1)).toEqual([
      'Finished exporting scripts with errors.',
      'fail',
    ]);
  });

  test('--allow-failures keeps the command successful, still printing the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(attempted).toEqual(IDS);
    expect(level()).toBe('warn');
    expect(summary()).toContain('b in realm alpha');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary when every script is exported', async () => {
    failing = new Set();

    expect(await run()).toBe(true);
    expect(attempted).toEqual(IDS);
    expect(summaries()).toHaveLength(0);
    expect(printError).not.toHaveBeenCalled();
    expect(lastStop().slice(1)).toEqual([
      'Finished exporting scripts.',
      'success',
    ]);
  });

  test('exports only the scripts with the given prefix, and skips scripts of other languages', async () => {
    failing = new Set();
    frodo.script.readScripts
      .mockReset()
      .mockResolvedValue([
        ...SCRIPTS,
        { ...SCRIPTS[0], _id: 'id-g', name: 'g', language: 'GROOVY' },
        { ...SCRIPTS[0], _id: 'id-ab', name: 'ab' },
      ]);

    expect(await run(false, { prefixes: ['a'] })).toBe(true);
    expect(attempted).toEqual(['a', 'ab']);
    expect(summaries()).toHaveLength(0);
  });

  test('a realm whose scripts cannot be read counts as one failure and the other realms still run', async () => {
    failing = new Set(['read alpha']);

    expect(await run(false, { realm: null })).toBe(false);
    expect(attempted).toEqual(IDS); // the three scripts of bravo
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toMatch(
      /^1 of 4 scripts failed:\n {2}- realm alpha: read failed/
    );
  });

  test('a named script exports only that script', async () => {
    failing = new Set();

    expect(await run(false, { name: 'c' })).toBe(true);
    expect(attempted).toEqual(['c']);
  });

  test('a named script that cannot be read fails the command whatever --allow-failures says', async () => {
    expect(await run(true, { name: 'zzz' })).toBe(false);
    expect(attempted).toEqual([]);
    expect(printError).toHaveBeenCalled();
    expect(summaries()).toHaveLength(0);
  });

  test('a named script of another language fails the command whatever --allow-failures says', async () => {
    frodo.script.readScriptByName
      .mockReset()
      .mockResolvedValue({ ...SCRIPTS[0], name: 'g', language: 'GROOVY' });

    expect(await run(true, { name: 'g' })).toBe(false);
    expect(attempted).toEqual([]);
    expect(messages()).toContain("Script 'g' is not a JavaScript script");
  });

  test('a name needs a single realm', async () => {
    expect(await run(false, { realm: null, name: 'a' })).toBe(false);
    expect(attempted).toEqual([]);
    expect(lastStop().slice(1)).toEqual([
      'Error: for a named script, specify a single realm',
      'fail',
    ]);
  });
});

describe('config-manager push scripts', () => {
  const run = (allowFailures, { realm = 'alpha', name, filter } = {}) =>
    ops.configManagerImportScripts(realm, name, filter, allowFailures);

  beforeEach(() => {
    for (const id of IDS) {
      put(configFile(id), {
        _id: `id-${id}`,
        name: id,
        script: { file: `scripts-content/CTX/${id}.js` },
      });
      put(`realms/alpha/scripts/scripts-content/CTX/${id}.js`, 'code');
    }
    put('realms/README.md', 'a file, not a realm');
  });
  const warnings = () =>
    printMessage.mock.calls.filter(([, level]) => level === 'warn');

  test('runs every script after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    expect(attempted.sort()).toEqual(IDS);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      /^1 of 3 scripts failed:\n {2}- b in realm alpha: could not update b/
    );
    expect(lastStop().slice(1)).toEqual([
      'Finished importing scripts with errors.',
      'fail',
    ]);
  });

  test('--allow-failures keeps the command successful, still printing the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(attempted.sort()).toEqual(IDS);
    expect(level()).toBe('warn');
    expect(summary()).toContain('b in realm alpha');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary when every script is imported', async () => {
    failing = new Set();

    expect(await run()).toBe(true);
    expect(attempted.sort()).toEqual(IDS);
    expect(summaries()).toHaveLength(0);
    expect(printError).not.toHaveBeenCalled();
    expect(lastStop().slice(1)).toEqual([
      'Finished importing scripts.',
      'success',
    ]);

    // the same without naming the realm: only the realm folders count
    attempted = [];
    expect(await run(false, { realm: null })).toBe(true);
    expect(attempted.sort()).toEqual(IDS);
    expect(warnings()).toHaveLength(0);
  });

  test('a script whose content file is missing fails on its own and the others still run', async () => {
    failing = new Set();
    fs.rmSync(path.join(tmp, 'realms/alpha/scripts/scripts-content/CTX/b.js'));

    expect(await run()).toBe(false);
    expect(attempted.sort()).toEqual(['a', 'c']);
    expect(summary()).toMatch(
      /^1 of 3 scripts failed:\n {2}- b in realm alpha: /
    );
  });

  test('a script without a name fails on its own and the others still run', async () => {
    failing = new Set();
    put(configFile('b'), {
      _id: 'id-b',
      name: ' ',
      script: { file: 'scripts-content/CTX/b.js' },
    });

    expect(await run()).toBe(false);
    expect(attempted.sort()).toEqual(['a', 'c']);
    expect(messages()).toContain(
      'Script id-b must have a valid (non-blank) name!'
    );
    expect(summary()).toMatch(
      /^1 of 3 scripts failed:\n {2}- id-b\.json in realm alpha: blank name/
    );
  });

  test('a config file that is not JSON fails on its own and the others still run', async () => {
    failing = new Set();
    put('realms/alpha/scripts/scripts-config/broken.json', 'not json');

    expect(await run()).toBe(false);
    expect(attempted.sort()).toEqual(IDS);
    expect(summary()).toMatch(
      /^1 of 4 scripts failed:\n {2}- broken\.json in realm alpha: /
    );
  });

  test('the filename filter decides which scripts are imported', async () => {
    failing = new Set();
    fileFilter.mockImplementation((file, filter) => {
      expect(filter).toBe('a');
      return file.endsWith('/a.js');
    });

    expect(await run(false, { filter: 'a' })).toBe(true);
    expect(attempted).toEqual(['a']);
  });

  test('a named script imports only that script', async () => {
    failing = new Set();

    expect(await run(false, { name: 'b' })).toBe(true);
    expect(attempted).toEqual(['b']);
  });

  test('a named script that is in no file fails the command whatever --allow-failures says', async () => {
    failing = new Set();

    expect(await run(true, { name: 'zzz' })).toBe(false);
    expect(attempted).toEqual([]);
    expect(messages()).toContain('Script "zzz" not found');
    expect(summaries()).toHaveLength(0);
  });

  test('a name needs a single realm', async () => {
    fs.mkdirSync(path.join(tmp, 'realms/bravo'));

    expect(await run(false, { realm: null, name: 'a' })).toBe(false);
    expect(attempted).toEqual([]);
    expect(lastStop().slice(1)).toEqual([
      'For a named script, specify a single realm',
      'fail',
    ]);
  });

  test('a realm folder without script config is skipped with the warning that names the folder, and is not a failure', async () => {
    failing = new Set();
    fs.mkdirSync(path.join(tmp, 'realms/bravo'));

    expect(await run(false, { realm: null })).toBe(true);
    expect(attempted.sort()).toEqual(IDS);
    expect(summaries()).toHaveLength(0);
    const warning = printMessage.mock.calls.find(([text]) =>
      /no script config defined in realm bravo/.test(String(text))
    );
    expect(warning[1]).toBe('warn');
    expect(warning[0]).toBe(
      `Warning: no script config defined in realm bravo. Expecting directory ${tmp}/realms/bravo/scripts/scripts-config`
    );
  });

  test('a named realm without script config fails the command whatever --allow-failures says', async () => {
    failing = new Set();
    fs.mkdirSync(path.join(tmp, 'realms/bravo'));

    expect(await run(true, { realm: 'bravo' })).toBe(false);
    expect(attempted).toEqual([]);
    expect(messages()).toContain('No script config defined in realm bravo');
    expect(summaries()).toHaveLength(0);
  });

  test('a config folder without a realms folder fails with a plain message, whatever --allow-failures says', async () => {
    fs.rmSync(path.join(tmp, 'realms'), { recursive: true });

    expect(await run(true, { realm: null })).toBe(false);
    expect(attempted).toEqual([]);
    expect(lastStop()[1]).toContain(`There is no 'realms' folder in '${tmp}'`);
    expect(lastStop()[2]).toBe('fail');
    // not the file-system error that the missing folder used to surface as
    expect(printError).not.toHaveBeenCalled();
  });
});
