/**
 * Unit tests for `findSecretVersionsToPrune` in
 * src/configManagerOps/FrConfigSecretOps.ts: what `config-manager push secrets
 * --prune` shows, and asks about, before it deletes (cli record 0037), found
 * without a tenant. The facade and the console are mocked before the module is
 * imported (the bundled ESM of frodo-lib cannot load under jest's ESM runtime);
 * the files are real files in a temporary folder and OperationRun stays real.
 * A prune deletes versions of secrets for good, so what these tests guard is
 * that the preview asks the library for exactly the versions the prune would
 * delete, that nothing is written or deleted while it looks, that a secret that
 * cannot be checked is reported and never taken for "nothing to delete", and
 * that a missing folder, a named secret without a file and a listing that fails
 * end the check.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);

let tmp;
let listed;
// the secrets of the tenant, and what the listing does: 'ok' answers them,
// 'fail' rejects, anything else is answered as it is (not a list)
let remote;
let listing;
// the versions that a prune would delete, by secret id; the ids whose lookup fails
let toPrune;
let failingIds;
const found = [];
const pruned = [];
const written = [];

const version = (n, status = 'ENABLED') => ({ version: String(n), status });

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      getFilePath: (file) => path.join(tmp, file),
      saveJsonToFile: () => {},
      readJsonFile: (file) => JSON.parse(fs.readFileSync(file, 'utf8')),
    },
    cloud: {
      secret: {
        readSecrets: async () => {
          listed++;
          if (listing === 'fail') throw new Error('listing refused');
          return listing === 'ok' ? remote : listing;
        },
        createSecret: async (id) => {
          written.push(`create ${id}`);
          return { activeVersion: '1' };
        },
        createVersionOfSecret: async (id) => {
          written.push(`version ${id}`);
          return { version: '2' };
        },
        readVersionsOfSecret: async () => [],
        findVersionsToPrune: async (id, keepLoaded, keepDeactivated) => {
          found.push([id, keepLoaded, keepDeactivated]);
          if (failingIds.has(id)) throw new Error(`versions of ${id} refused`);
          return toPrune[id] ?? [];
        },
        pruneVersionsOfSecret: async (id, keepLoaded, keepDeactivated) => {
          pruned.push([id, keepLoaded, keepDeactivated]);
          return toPrune[id] ?? [];
        },
        deleteSecret: async (id) => {
          written.push(`delete ${id}`);
          return {};
        },
      },
    },
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
  printError: (error, message) =>
    printed.push({
      msg: `${message ?? ''} ${error?.message ?? error}`.trim(),
      type: 'error',
    }),
  createProgressIndicator: () => 'indicator',
  stopProgressIndicator: () => {},
  updateProgressIndicator: () => {},
}));

jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  csvEscape: (value) => value,
  esvToEnv: (value) => value,
  friendlyTimestamp: () => 'now',
}));

const { findSecretVersionsToPrune, configManagerImportSecrets } =
  await import('../../src/configManagerOps/FrConfigSecretOps.ts');

/** Writes the file of a secret in the folder a push reads. */
function secretFile(id, extra = {}) {
  const dir = path.join(tmp, 'esvs/secrets');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${id}.json`),
    JSON.stringify({
      _id: id,
      description: 'd',
      encoding: 'generic',
      useInPlaceholders: true,
      valueBase64: 'dmFsdWU=',
      ...extra,
    })
  );
}

const inTenant = (id) => ({ _id: id, activeVersion: '3', loaded: false });

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'push-prune-'));
  printed.length = 0;
  found.length = 0;
  pruned.length = 0;
  written.length = 0;
  listed = 0;
  listing = 'ok';
  failingIds = new Set();
  remote = [inTenant('esv-a'), inTenant('esv-b'), inTenant('esv-c')];
  toPrune = {
    'esv-a': [version(1), version(2)],
    'esv-b': [],
    'esv-c': [version(1)],
  };
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('what is found', () => {
  test('is, for every secret of the folder that is in the tenant, what the library would prune', async () => {
    secretFile('esv-a');
    secretFile('esv-b');
    secretFile('esv-new');

    const check = await findSecretVersionsToPrune();

    expect(check.plan).toEqual([
      { secretId: 'esv-a', versions: [version(1), version(2)] },
      { secretId: 'esv-b', versions: [] },
    ]);
    expect(check.notChecked).toEqual([]);
    expect(check.run.finish()).toBe(true);
  });

  test('asks for the versions that the prune deletes, with the same two choices', async () => {
    secretFile('esv-a');

    const check = await findSecretVersionsToPrune('esv-a');
    await configManagerImportSecrets('esv-a', true);

    // loaded versions are not kept, deactivated versions are
    expect(found).toEqual([['esv-a', false, true]]);
    expect(pruned).toEqual(found);
    expect(check.keepLoaded).toBe(false);
    expect(check.keepDeactivated).toBe(true);
  });

  test('a secret that is not in the tenant yet has nothing to prune and is not asked about', async () => {
    secretFile('esv-new');

    const check = await findSecretVersionsToPrune();

    expect(check.plan).toEqual([]);
    expect(found).toEqual([]);
    expect(check.run.finish()).toBe(true);
  });

  test('only the secret that is named, and only .json files', async () => {
    secretFile('esv-a');
    secretFile('esv-b');
    fs.writeFileSync(path.join(tmp, 'esvs/secrets/notes.txt'), 'not a secret');

    const named = await findSecretVersionsToPrune('esv-b');
    expect(named.plan.map((p) => p.secretId)).toEqual(['esv-b']);

    found.length = 0;
    const all = await findSecretVersionsToPrune();
    expect(all.plan.map((p) => p.secretId)).toEqual(['esv-a', 'esv-b']);
    // notes.txt was not read, so it did not fail as a file that is no JSON
    expect(all.notChecked).toEqual([]);
    expect(all.run.finish()).toBe(true);
  });

  test('is found without writing, pruning or deleting anything', async () => {
    secretFile('esv-a');
    secretFile('esv-b');

    await findSecretVersionsToPrune();

    expect(written).toEqual([]);
    expect(pruned).toEqual([]);
  });
});

describe('a secret that cannot be checked', () => {
  test('is listed as not checked and fails the run, and the others are still checked', async () => {
    secretFile('esv-a');
    secretFile('esv-b');
    secretFile('esv-c');
    failingIds = new Set(['esv-b']);

    const check = await findSecretVersionsToPrune();

    expect(check.plan.map((p) => p.secretId)).toEqual(['esv-a', 'esv-c']);
    expect(check.notChecked).toEqual([
      { secretId: 'esv-b', reason: expect.stringContaining('esv-b') },
    ]);
    expect(check.run.finish()).toBe(false);
    expect(messages('error').join('\n')).toContain('versions of esv-b refused');
  });

  test('is a success with --allow-failures, and still listed', async () => {
    secretFile('esv-a');
    secretFile('esv-b');
    failingIds = new Set(['esv-b']);

    const check = await findSecretVersionsToPrune(undefined, true);

    expect(check.notChecked.map((n) => n.secretId)).toEqual(['esv-b']);
    expect(check.run.finish()).toBe(true);
  });

  test('also when its file cannot be read', async () => {
    secretFile('esv-a');
    fs.writeFileSync(path.join(tmp, 'esvs/secrets/esv-bad.json'), '{ not json');

    const check = await findSecretVersionsToPrune();

    expect(check.plan.map((p) => p.secretId)).toEqual(['esv-a']);
    expect(check.notChecked.map((n) => n.secretId)).toEqual(['esv-bad']);
    expect(check.run.finish()).toBe(false);
  });
});

describe('nothing can be checked when', () => {
  test('the folder is not there', async () => {
    expect(await findSecretVersionsToPrune()).toBeUndefined();

    expect(messages('error')).toEqual([
      expect.stringMatching(
        /^No secrets to import: the folder '.*esvs\/secrets\/' does not exist$/
      ),
    ]);
    expect(listed).toBe(0);
    expect(found).toEqual([]);
  });

  test('the secret that is named has no file', async () => {
    secretFile('esv-a');

    expect(await findSecretVersionsToPrune('esv-zzz')).toBeUndefined();

    expect(messages('error')).toEqual(['No matching secret found for esv-zzz']);
    expect(found).toEqual([]);
  });

  test('the list of secrets of the tenant cannot be read', async () => {
    secretFile('esv-a');
    listing = 'fail';

    expect(await findSecretVersionsToPrune()).toBeUndefined();

    expect(messages('error').join('\n')).toContain('listing refused');
    expect(found).toEqual([]);
  });

  test('the list of secrets of the tenant is not a list', async () => {
    secretFile('esv-a');
    listing = { not: 'a list' };

    expect(await findSecretVersionsToPrune()).toBeUndefined();

    expect(messages('error').join('\n')).toContain('not a list');
    expect(found).toEqual([]);
  });
});

describe('a folder without any secret file', () => {
  test('has nothing to prune and is not an error', async () => {
    fs.mkdirSync(path.join(tmp, 'esvs/secrets'), { recursive: true });

    const check = await findSecretVersionsToPrune();

    expect(check.plan).toEqual([]);
    expect(check.notChecked).toEqual([]);
    expect(check.run.finish()).toBe(true);
  });
});
