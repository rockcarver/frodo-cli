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
 * Decision records 0040 and 0041 for `config-manager pull saml` and
 * `config-manager push saml`. When one SAML provider or circle of trust cannot
 * be exported or imported, the others still run, one summary names it and the
 * cause, and the command fails, unless --allow-failures was given. A file that
 * does not exist, a named SAML entity that is in no file, a named realm without
 * SAML config and a config folder without a realms folder fail the command
 * whatever the flag says (record 0041, cli#1112).
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
const FILE = 'src/configManagerOps/FrConfigSamlOps.ts';

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

const ops = await import(path.resolve(root, FILE));

const { escapePlaceholders, safeFileNameUnderscore, replaceAllInJson } =
  spies.get(path.resolve(root, 'src/utils/FrConfig'));
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

const PROVIDERS = ['p1', 'p2', 'p3'];
const COTS = ['c1', 'c2'];
const samlDir = (realm = 'alpha') => `realms/${realm}/realm-config/saml`;

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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-saml-failures-'));
  failing = new Set();
  attempted = [];
  saved = [];
  escapePlaceholders.mockReset().mockImplementation((x) => x);
  safeFileNameUnderscore.mockReset().mockImplementation((x) => x);
  replaceAllInJson
    .mockReset()
    .mockImplementation((object) => ({ ...object, replaced: true }));
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
  // export: a provider is exported as hosted unless its id starts with r
  frodo.saml2.entityProvider.exportSaml2Provider
    .mockReset()
    .mockImplementation(async (entityId) => {
      attempted.push(entityId);
      if (failing.has(entityId))
        throw new Error(`could not export ${entityId}`);
      const config = { entityId };
      const remote = entityId.startsWith('r');
      return {
        saml: {
          hosted: remote ? {} : { [entityId]: config },
          remote: remote ? { [entityId]: config } : {},
          metadata: { [entityId]: ['meta', entityId] },
        },
      };
    });
  frodo.saml2.circlesOfTrust.exportCircleOfTrust
    .mockReset()
    .mockImplementation(async (cot) => {
      attempted.push(cot);
      if (failing.has(cot)) throw new Error(`could not export ${cot}`);
      return { saml: { cot: { [cot]: { _id: cot } } } };
    });
  // import: one provider per call, all circles of trust in one call
  frodo.saml2.entityProvider.importSaml2Providers
    .mockReset()
    .mockImplementation(async ({ saml }) => {
      const [id] = Object.keys({ ...saml.hosted, ...saml.remote });
      attempted.push(id);
      if (failing.has(id)) throw new Error(`could not import ${id}`);
    });
  frodo.saml2.circlesOfTrust.importCirclesOfTrust
    .mockReset()
    .mockImplementation(async ({ saml }) => {
      const ids = Object.keys(saml.cot);
      attempted.push(...ids);
      const errors = ids
        .filter((id) => failing.has(id))
        .map((id) => new Error(`Error creating circle of trust ${id}`));
      if (errors.length > 0) {
        throw Object.assign(
          new Error('Error importing alpha realm circles of trust'),
          { originalErrors: errors }
        );
      }
    });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('config-manager pull saml', () => {
  const run = (allowFailures, file = path.join(tmp, 'saml.json')) =>
    ops.configManagerExportSaml(file, allowFailures);

  beforeEach(() => {
    failing = new Set(['p2', 'c1']);
    put('saml.json', {
      alpha: {
        samlProviders: PROVIDERS.map((entityId) => ({ entityId })),
        circlesOfTrust: COTS,
      },
    });
  });

  test('runs every provider and circle of trust after some failed, names them in one summary and fails', async () => {
    expect(await run()).toBe(false);

    expect(attempted).toEqual([...PROVIDERS, ...COTS]);
    expect(saved).toEqual([
      `${samlDir()}/hosted/p1.json`,
      `${samlDir()}/hosted/p3.json`,
      `${samlDir()}/COT/c2.json`,
    ]);
    // the failures themselves are shown too, not only counted
    expect(printError).toHaveBeenCalledTimes(2);
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      /^2 of 5 items failed:\n {2}- provider p2 in realm alpha: could not export p2\n {2}- circle of trust c1 in realm alpha: could not export c1/
    );
  });

  test('--allow-failures keeps the command successful, still printing the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(attempted).toEqual([...PROVIDERS, ...COTS]);
    expect(level()).toBe('warn');
    expect(summary()).toContain('provider p2 in realm alpha');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary when everything is exported', async () => {
    failing = new Set();

    expect(await run()).toBe(true);
    expect(saved).toHaveLength(5);
    expect(summaries()).toHaveLength(0);
    expect(printError).not.toHaveBeenCalled();
  });

  test('writes a remote provider below remote and applies its replacements', async () => {
    failing = new Set();
    put('saml.json', {
      alpha: {
        samlProviders: [{ entityId: 'r1', replacements: [{ search: 'a' }] }],
        circlesOfTrust: [],
      },
    });

    expect(await run()).toBe(true);
    expect(saved).toEqual([`${samlDir()}/remote/r1.json`]);
    const [object] = frodo.utils.saveJsonToFile.mock.calls[0];
    expect(object.config).toEqual({ entityId: 'r1', replaced: true });
    expect(object.metadata).toBe('meta\nr1');
  });

  test('a realm that lists no circles of trust, or no providers, is not an error', async () => {
    failing = new Set();
    put('saml.json', {
      alpha: { samlProviders: [{ entityId: 'p1' }] },
      bravo: { circlesOfTrust: ['c1'] },
    });

    expect(await run()).toBe(true);
    expect(saved).toEqual([
      `${samlDir()}/hosted/p1.json`,
      `${samlDir('bravo')}/COT/c1.json`,
    ]);
  });

  test('a file that does not exist fails with a plain message, whatever --allow-failures says', async () => {
    expect(await run(true, path.join(tmp, 'missing.json'))).toBe(false);

    expect(messages()).toContain(
      `The SAML config file '${path.join(tmp, 'missing.json')}' does not exist.`
    );
    expect(attempted).toEqual([]);
    expect(printError).not.toHaveBeenCalled();
  });

  test('a file that is not JSON fails, whatever --allow-failures says', async () => {
    put('saml.json', 'not json');

    expect(await run(true)).toBe(false);
    expect(attempted).toEqual([]);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaries()).toHaveLength(0);
  });
});

describe('config-manager push saml', () => {
  const run = (allowFailures, { realm = 'alpha', name } = {}) =>
    ops.configManagerImportSaml(realm, name, allowFailures);

  beforeEach(() => {
    failing = new Set(['h2', 'c2']);
    for (const id of ['h1', 'h2']) {
      put(`${samlDir()}/hosted/${id}.json`, {
        config: { entityId: id },
        metadata: `meta-${id}`,
      });
    }
    put(`${samlDir()}/remote/r1.json`, {
      config: { entityId: 'r1' },
      metadata: 'meta-r1',
    });
    for (const id of COTS) {
      put(`${samlDir()}/COT/${id}.json`, { _id: id, trustedProviders: [] });
    }
  });

  test('imports every provider and circle of trust after some failed, names them in one summary and fails', async () => {
    expect(await run()).toBe(false);

    // hosted providers first, then remote ones, then the circles of trust
    expect(attempted).toEqual(['h1', 'h2', 'r1', 'c1', 'c2']);
    expect(printError).toHaveBeenCalledTimes(2);
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      /^2 of 5 items failed:\n {2}- provider h2 in realm alpha: could not import h2\n {2}- Error creating circle of trust c2/
    );
    expect(lastStop().slice(1)).toEqual([
      'SAML import finished with errors.',
      'fail',
    ]);
  });

  test('--allow-failures keeps the command successful, still printing the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(attempted).toEqual(['h1', 'h2', 'r1', 'c1', 'c2']);
    expect(level()).toBe('warn');
    expect(summary()).toContain('provider h2 in realm alpha');
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary when everything is imported', async () => {
    failing = new Set();

    expect(await run()).toBe(true);
    expect(attempted).toEqual(['h1', 'h2', 'r1', 'c1', 'c2']);
    expect(summaries()).toHaveLength(0);
    expect(printError).not.toHaveBeenCalled();
    expect(lastStop().slice(1)).toEqual(['SAML import completed.', 'success']);
  });

  test('imports each provider with its own metadata and without dependencies', async () => {
    failing = new Set();

    await run();

    const calls = frodo.saml2.entityProvider.importSaml2Providers.mock.calls;
    expect(calls).toHaveLength(3);
    const [data, options] = calls[2];
    expect(options).toEqual({ deps: false });
    expect(data.saml.remote).toEqual({ r1: { entityId: 'r1' } });
    expect(data.saml.hosted).toEqual({});
    expect(data.saml.metadata).toEqual({ r1: ['meta-r1'] });
  });

  test('a circles of trust import that fails without naming a circle counts as one failure', async () => {
    failing = new Set();
    frodo.saml2.circlesOfTrust.importCirclesOfTrust
      .mockReset()
      .mockRejectedValue(new Error('read failed'));

    expect(await run()).toBe(false);
    expect(summary()).toMatch(
      /^1 of 4 items failed:\n {2}- circles of trust in realm alpha: read failed/
    );
  });

  test('a provider file that is not JSON fails on its own and the others still run', async () => {
    failing = new Set();
    put(`${samlDir()}/hosted/broken.json`, 'not json');

    expect(await run()).toBe(false);
    expect(attempted.sort()).toEqual(['c1', 'c2', 'h1', 'h2', 'r1']);
    expect(summary()).toMatch(
      /^1 of 6 items failed:\n {2}- provider broken\.json in realm alpha: /
    );
  });

  test('a circle of trust file that is not JSON fails on its own and the others still run', async () => {
    failing = new Set();
    put(`${samlDir()}/COT/broken.json`, 'not json');

    expect(await run()).toBe(false);
    expect(attempted).toEqual(['h1', 'h2', 'r1', 'c1', 'c2']);
    expect(summary()).toMatch(
      /^1 of 6 items failed:\n {2}- circle of trust file broken\.json in realm alpha: /
    );
  });

  test('a named entity imports only that provider', async () => {
    failing = new Set();

    expect(await run(false, { name: 'r1' })).toBe(true);
    expect(attempted.filter((id) => id.startsWith('h') || id === 'r1')).toEqual(
      ['r1']
    );
  });

  test('a named entity that is in no file fails the command whatever --allow-failures says', async () => {
    failing = new Set();

    expect(await run(true, { name: 'zzz' })).toBe(false);
    expect(attempted.filter((id) => id.startsWith('h') || id === 'r1')).toEqual(
      []
    );
    expect(messages()).toContain("SAML entity 'zzz' not found");
    expect(summaries()).toHaveLength(0);
    expect(lastStop().slice(1)).toEqual([
      'SAML import finished with errors.',
      'fail',
    ]);
  });

  test('a name needs a single realm', async () => {
    fs.mkdirSync(path.join(tmp, 'realms/bravo'));

    expect(await run(false, { realm: null, name: 'r1' })).toBe(false);
    expect(attempted).toEqual([]);
    expect(lastStop().slice(1)).toEqual([
      'For a named SAML entity, specify a single realm.',
      'fail',
    ]);
  });

  test('a realm folder without SAML config has nothing to push and is not a failure', async () => {
    failing = new Set();
    fs.mkdirSync(path.join(tmp, 'realms/bravo'));

    expect(await run(false, { realm: null })).toBe(true);
    expect(attempted).toEqual(['h1', 'h2', 'r1', 'c1', 'c2']);
    expect(summaries()).toHaveLength(0);
  });

  test('a named realm without SAML config fails the command whatever --allow-failures says', async () => {
    failing = new Set();
    fs.mkdirSync(path.join(tmp, 'realms/bravo'));

    expect(await run(true, { realm: 'bravo' })).toBe(false);
    expect(attempted).toEqual([]);
    expect(messages()).toContain("There is no SAML config for realm 'bravo'");
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
