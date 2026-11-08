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
 * Decision records 0040 and 0041 for `config-manager pull secret-mappings` and
 * `config-manager push secret-mappings`. When one secret mapping (or the
 * mappings of one realm) cannot be exported or imported, the others still run,
 * one summary names it and the cause, and the command fails, unless
 * --allow-failures was given. A named secret mapping that is nowhere, and a
 * named realm without a secret-mappings folder, fail the command whatever the
 * flag says (record 0041, cli#1112). A realm of the tenant that has no folder
 * has nothing to push and is skipped.
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
const FILE = 'src/configManagerOps/FrConfigSecretMappingsOps.ts';

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

const { verboseMessage } = spies.get(consoleTarget);

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

const REALMS = ['alpha', 'bravo', 'charlie'];
const idOf = (realm) => `am.${realm}`;
const mappingFile = (realm) =>
  `realms/${realm}/secret-mappings/${idOf(realm)}.json`;

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

beforeEach(() => {
  jest.clearAllMocks();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-secretmappings-failures-'));
  failing = new Set([idOf('bravo')]);
  attempted = [];
  current = undefined;
  state.setRealm.mockReset().mockImplementation((realm) => {
    current = realm;
  });
  frodo.utils.getFilePath
    .mockReset()
    .mockImplementation((relative) => path.join(tmp, relative));
  frodo.utils.readJsonFile
    .mockReset()
    .mockImplementation((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  frodo.utils.saveJsonToFile.mockReset();
  realmList.mockReset().mockResolvedValue(['/', ...REALMS]);
  // export: every realm has one mapping, named after it
  frodo.secretStore.readSecretStoreMappings
    .mockReset()
    .mockImplementation(async () => {
      if (failing.has(`read ${current}`)) throw new Error('read failed');
      return [{ _id: idOf(current) }];
    });
  frodo.secretStore.updateSecretStoreMapping
    .mockReset()
    .mockImplementation(async (_store, _type, mapping) => {
      attempted.push(mapping._id);
      if (failing.has(mapping._id)) {
        throw new Error(`could not update ${mapping._id}`);
      }
    });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('config-manager pull secret-mappings', () => {
  const run = (allowFailures, name, realm) =>
    ops.configManagerExportSecretMappings(name, realm, allowFailures);
  const saved = () =>
    frodo.utils.saveJsonToFile.mock.calls.map(([mapping]) => mapping._id);

  beforeEach(() => {
    // exporting fails when a mapping cannot be written
    frodo.utils.saveJsonToFile
      .mockReset()
      .mockImplementation((mapping, file) => {
        attempted.push(mapping._id);
        if (failing.has(mapping._id))
          throw new Error(`could not write ${file}`);
      });
  });

  test('runs every secret mapping after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    expect(attempted).toEqual(REALMS.map(idOf));
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      /^1 of 3 secret mappings failed:\n {2}- am\.bravo in realm bravo: could not write /
    );
  });

  test('--allow-failures keeps the command successful, still printing the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(attempted).toEqual(REALMS.map(idOf));
    expect(level()).toBe('warn');
    expect(summary()).toContain('am.bravo in realm bravo');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary when every secret mapping is exported, and skips the root realm', async () => {
    failing = new Set();

    expect(await run()).toBe(true);
    expect(saved()).toEqual(REALMS.map(idOf));
    expect(current).toBe('charlie'); // '/' was never selected
    expect(state.setRealm.mock.calls.map(([realm]) => realm)).toEqual(REALMS);
    expect(summaries()).toHaveLength(0);
    expect(printError).not.toHaveBeenCalled();
  });

  test('a realm whose secret mappings cannot be read counts as one failure and the other realms still run', async () => {
    failing = new Set(['read bravo']);

    expect(await run()).toBe(false);
    expect(saved()).toEqual([idOf('alpha'), idOf('charlie')]);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toMatch(
      /^1 of 3 secret mappings failed:\n {2}- realm bravo: read failed/
    );
  });

  test('a named secret mapping exports only that one', async () => {
    failing = new Set();

    expect(await run(false, idOf('charlie'))).toBe(true);
    expect(saved()).toEqual([idOf('charlie')]);
  });

  test('a named secret mapping that is in no realm fails the command whatever --allow-failures says', async () => {
    failing = new Set();

    expect(await run(true, 'am.zzz')).toBe(false);
    expect(saved()).toEqual([]);
    expect(messages()).toContain("Secret mapping 'am.zzz' not found.");
    expect(summaries()).toHaveLength(0);
  });

  test('fails whatever --allow-failures says when it cannot read the realms', async () => {
    realmList.mockReset().mockRejectedValue(new Error('read failed'));

    expect(await run(true)).toBe(false);
    expect(printError).toHaveBeenCalled();
    expect(summaries()).toHaveLength(0); // the error is shown once, no summary
  });

  test('nothing to export is a success', async () => {
    frodo.secretStore.readSecretStoreMappings.mockReset().mockResolvedValue([]);

    expect(await run()).toBe(true);
    expect(saved()).toEqual([]);
    expect(printError).not.toHaveBeenCalled();
    expect(summaries()).toHaveLength(0);
  });
});

describe('config-manager push secret-mappings', () => {
  const run = (allowFailures, name, realm) =>
    ops.configManagerImportSecretMappings(name, realm, allowFailures);

  beforeEach(() => {
    for (const realm of REALMS) {
      put(mappingFile(realm), { _id: idOf(realm), _rev: '1', aliases: [] });
    }
    put('realms/alpha/secret-mappings/README.md', 'is not a mapping');
  });

  test('runs every secret mapping after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    expect(attempted).toEqual(REALMS.map(idOf));
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      /^1 of 3 secret mappings failed:\n {2}- am\.bravo in realm bravo: could not update am\.bravo/
    );
  });

  test('--allow-failures keeps the command successful, still printing the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(attempted).toEqual(REALMS.map(idOf));
    expect(level()).toBe('warn');
    expect(summary()).toContain('am.bravo in realm bravo');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary when every secret mapping is imported, without its revision', async () => {
    failing = new Set();

    expect(await run()).toBe(true);
    expect(attempted).toEqual(REALMS.map(idOf));
    for (const [, , mapping] of frodo.secretStore.updateSecretStoreMapping.mock
      .calls) {
      expect(mapping._rev).toBeUndefined();
    }
    expect(summaries()).toHaveLength(0);
    expect(printError).not.toHaveBeenCalled();
  });

  test('a file that is not JSON fails on its own and the others still run', async () => {
    failing = new Set();
    put('realms/bravo/secret-mappings/broken.json', 'not json');

    expect(await run()).toBe(false);
    expect(attempted).toEqual(REALMS.map(idOf));
    expect(summary()).toMatch(
      /^1 of 4 secret mappings failed:\n {2}- broken\.json in realm bravo: /
    );
  });

  test('a realm of the tenant without a folder has nothing to push: it is skipped quietly and is not a failure', async () => {
    failing = new Set();
    fs.rmSync(path.join(tmp, 'realms/bravo'), { recursive: true });

    expect(await run()).toBe(true);
    expect(attempted).toEqual([idOf('alpha'), idOf('charlie')]);
    expect(summaries()).toHaveLength(0);
    expect(messages()).not.toContain('bravo');
    expect(
      verboseMessage.mock.calls.map(([text]) => String(text)).join('\n')
    ).toContain("Skipping realm 'bravo'");
  });

  test('a named realm without a folder fails the command whatever --allow-failures says', async () => {
    failing = new Set();
    fs.rmSync(path.join(tmp, 'realms/bravo'), { recursive: true });

    expect(await run(true, undefined, 'bravo')).toBe(false);
    expect(attempted).toEqual([]);
    expect(messages()).toContain(
      "There is no secret-mappings folder for realm 'bravo'"
    );
    expect(summaries()).toHaveLength(0);
  });

  test('a named secret mapping imports only that one', async () => {
    failing = new Set();

    expect(await run(false, idOf('charlie'), 'charlie')).toBe(true);
    expect(attempted).toEqual([idOf('charlie')]);
  });

  test('a named secret mapping that is in no file fails the command whatever --allow-failures says', async () => {
    failing = new Set();

    expect(await run(true, 'am.zzz', 'alpha')).toBe(false);
    expect(attempted).toEqual([]);
    expect(messages()).toContain("Secret mapping 'am.zzz' not found.");
    expect(summaries()).toHaveLength(0);
  });

  test('fails whatever --allow-failures says when it cannot read the realms', async () => {
    realmList.mockReset().mockRejectedValue(new Error('read failed'));

    expect(await run(true)).toBe(false);
    expect(printError).toHaveBeenCalled();
    expect(attempted).toEqual([]);
    expect(summaries()).toHaveLength(0);
  });

  test('nothing to import is a success', async () => {
    fs.rmSync(path.join(tmp, 'realms'), { recursive: true });

    expect(await run()).toBe(true);
    expect(attempted).toEqual([]);
    expect(printError).not.toHaveBeenCalled();
    expect(summaries()).toHaveLength(0);
  });
});
