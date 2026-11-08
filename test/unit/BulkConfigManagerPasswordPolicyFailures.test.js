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
 * Decision records 0040 and 0041 for `config-manager pull password-policy` and
 * `config-manager push password-policy`. When the policy of one realm cannot
 * be exported or imported, the other realms still run, one summary names the
 * realm and the cause, and the command fails, unless --allow-failures was
 * given. A named realm without its file, and a config folder without a realms
 * folder, fail the command whatever the flag says (record 0041, cli#1112); a
 * realm folder without the file is only skipped, with a warning that names it.
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
const FILE = 'src/configManagerOps/FrConfigPasswordPolicyOps.ts';

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
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo,
  state: deepStub(),
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
const { realmList } = spies.get(path.resolve(root, 'src/utils/FrConfig'));

const ops = await import(path.resolve(root, FILE));

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
const policyFile = (realm) =>
  `realms/${realm}/password-policy/${realm}_user-password-policy.json`;

let tmp;
let failing;
let attempted;

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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-pwpolicy-failures-'));
  failing = new Set(['bravo']);
  attempted = [];
  frodo.utils.getFilePath
    .mockReset()
    .mockImplementation((relative) => path.join(tmp, relative));
  frodo.utils.getWorkingDirectory.mockReset().mockReturnValue(tmp);
  frodo.utils.readJsonFile
    .mockReset()
    .mockImplementation((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  frodo.utils.saveJsonToFile.mockReset();
  realmList.mockReset().mockResolvedValue(REALMS);
  // export: the policy of a realm is read by its entity id
  frodo.idm.config.readConfigEntity
    .mockReset()
    .mockImplementation(async (id) => {
      const realm = id.replace(/^fieldPolicy\//, '').replace(/_user$/, '');
      attempted.push(realm);
      if (failing.has(realm)) throw new Error(`could not read ${id}`);
      return { _id: id };
    });
  // import: the policy of a realm is written by its entity id
  frodo.idm.config.importConfigEntities
    .mockReset()
    .mockImplementation(async ({ idm }) => {
      const id = Object.keys(idm)[0];
      const realm = id.replace(/^fieldPolicy\//, '').replace(/_user$/, '');
      attempted.push(realm);
      if (failing.has(realm)) throw new Error(`could not import ${id}`);
    });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('config-manager pull password-policy', () => {
  const run = (allowFailures, realm) =>
    ops.configManagerExportPasswordPolicy(realm, allowFailures);

  test('runs every realm after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    expect(attempted).toEqual(REALMS);
    // the realms around the failed one are exported
    const saved = frodo.utils.saveJsonToFile.mock.calls.map(([, file]) => file);
    expect(saved).toEqual([
      path.join(tmp, policyFile('alpha')),
      path.join(tmp, policyFile('charlie')),
    ]);
    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      /^1 of 3 realms failed:\n {2}- bravo: could not read fieldPolicy\/bravo_user/
    );
  });

  test('--allow-failures keeps the command successful, still printing the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(attempted).toEqual(REALMS);
    expect(level()).toBe('warn');
    expect(summary()).toContain('bravo');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary when every realm is exported', async () => {
    failing = new Set();

    expect(await run()).toBe(true);
    expect(attempted).toEqual(REALMS);
    expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(3);
    expect(summaries()).toHaveLength(0);
    expect(printError).not.toHaveBeenCalled();
  });

  test('a named realm exports only that realm', async () => {
    failing = new Set();

    expect(await run(false, 'charlie')).toBe(true);
    expect(attempted).toEqual(['charlie']);
    expect(realmList).not.toHaveBeenCalled();
  });

  test('fails whatever --allow-failures says when it cannot read the realms', async () => {
    realmList.mockReset().mockRejectedValue(new Error('read failed'));

    expect(await run(true)).toBe(false);
    expect(printError).toHaveBeenCalled();
    expect(attempted).toEqual([]);
    expect(summaries()).toHaveLength(0); // the error is shown once, no summary
  });

  test('nothing to export is a success', async () => {
    realmList.mockReset().mockResolvedValue([]);

    expect(await run()).toBe(true);
    expect(printError).not.toHaveBeenCalled();
    expect(summaries()).toHaveLength(0);
  });
});

describe('config-manager push password-policy', () => {
  const run = (allowFailures, realm) =>
    ops.configManagerImportPasswordPolicy(realm, allowFailures);
  const policy = (realm) => ({ _id: `fieldPolicy/${realm}_user` });

  beforeEach(() => {
    for (const realm of REALMS) put(policyFile(realm), policy(realm));
    put('realms/notes.txt', 'a file, not a realm'); // is not a realm
  });
  const warnings = () =>
    printMessage.mock.calls.filter(([, level]) => level === 'warn');

  test('runs every realm after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    expect(attempted.sort()).toEqual(REALMS);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      /^1 of 3 realms failed:\n {2}- bravo: could not import fieldPolicy\/bravo_user/
    );
  });

  test('--allow-failures keeps the command successful, still printing the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(attempted.sort()).toEqual(REALMS);
    expect(level()).toBe('warn');
    expect(summary()).toContain('bravo');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary when every realm is imported', async () => {
    failing = new Set();

    expect(await run()).toBe(true);
    expect(attempted.sort()).toEqual(REALMS);
    expect(summaries()).toHaveLength(0);
    expect(warnings()).toHaveLength(0);
    expect(printError).not.toHaveBeenCalled();
  });

  test('a file that is neither shape fails its realm only', async () => {
    failing = new Set();
    put(policyFile('bravo'), { passwordAttribute: 'password' });

    expect(await run()).toBe(false);
    expect(attempted.sort()).toEqual(['alpha', 'charlie']);
    expect(summary()).toMatch(
      /^1 of 3 realms failed:\n {2}- bravo: Invalid password policy payload in /
    );
  });

  test('a file that is not JSON fails its realm only', async () => {
    failing = new Set();
    put(policyFile('bravo'), 'not json');

    expect(await run()).toBe(false);
    expect(attempted.sort()).toEqual(['alpha', 'charlie']);
    expect(summary()).toMatch(/^1 of 3 realms failed:\n {2}- bravo: /);
  });

  test('a realm folder without the file is skipped with a warning that names it, and is not a failure', async () => {
    failing = new Set();
    fs.rmSync(path.join(tmp, policyFile('bravo')));

    expect(await run()).toBe(true);
    expect(attempted.sort()).toEqual(['alpha', 'charlie']);
    expect(summaries()).toHaveLength(0);
    expect(warnings()).toHaveLength(1);
    const warning = printMessage.mock.calls.find(([text]) =>
      /Skipping realm 'bravo'/.test(String(text))
    );
    expect(warning[1]).toBe('warn');
    expect(warning[0]).toContain(
      path.join(
        tmp,
        'realms/bravo/password-policy/bravo_user-password-policy.json'
      )
    );
  });

  test('a named realm without the file fails the command whatever --allow-failures says', async () => {
    failing = new Set();
    fs.rmSync(path.join(tmp, policyFile('bravo')));

    expect(await run(true, 'bravo')).toBe(false);
    expect(attempted).toEqual([]);
    expect(messages()).toContain(
      "There is no password policy file for realm 'bravo'"
    );
    expect(summaries()).toHaveLength(0);
  });

  test('a named realm imports only that realm', async () => {
    failing = new Set();

    expect(await run(false, 'charlie')).toBe(true);
    expect(attempted).toEqual(['charlie']);
  });

  test('a config folder without a realms folder fails with a plain message, whatever --allow-failures says', async () => {
    fs.rmSync(path.join(tmp, 'realms'), { recursive: true });

    expect(await run(true)).toBe(false);
    expect(attempted).toEqual([]);
    expect(messages()).toContain(`There is no 'realms' folder in '${tmp}'`);
    // not the file-system error that the missing folder used to surface as
    expect(printError).not.toHaveBeenCalled();
  });
});
