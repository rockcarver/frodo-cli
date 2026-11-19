import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Command } from 'commander';

/**
 * The Realm row of the connection page (record 0046), once a login has shown
 * what the system has: the rows it offers, the default it shows, and where a
 * realm that is chosen lands. The realm list is mocked; a real terminal run of
 * the same cases is ConnectionPageRealmRow.pty.test.js and the realm picker
 * tests that were moved onto the page.
 */
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const SENTINEL = '__default__realm__';

let realms = [
  { name: 'alpha', active: true },
  { name: 'bravo', active: false },
];
let readFails = false;
jest.unstable_mockModule(path.resolve(root, 'src/ops/RealmOps'), () => ({
  readRealmsCached: async () => {
    if (readFails) throw new Error('permission denied');
    return realms.map((realm) => ({ name: realm.name, active: realm.active }));
  },
}));

const { state } = await import('@rockcarver/frodo-lib');
const {
  applyRealmRowChoice,
  realmForPreview,
  realmRowSetup,
  resetRealmPickerStateForTests,
} = await import(path.resolve(root, 'src/utils/interactive/RealmPickers.ts'));
const { declareRealmUse } = await import(
  path.resolve(root, 'src/utils/interactive/RealmUse.ts')
);
const { realmOfRun, positionalValue } = await import(
  path.resolve(root, 'src/utils/interactive/PositionalArgs.ts')
);

/** A parsed leaf with a host and a realm positional. */
async function leaf(group = 'journey', name = 'list') {
  const program = new Command('frodo');
  const command = program
    .command(group)
    .command(name)
    .argument('[host]')
    .argument('[realm]', 'Realm.', SENTINEL)
    .action(async () => {});
  await program.parseAsync(['node', 'frodo', group, name, 'matrix']);
  return command;
}

beforeEach(() => {
  resetRealmPickerStateForTests();
  readFails = false;
  realms = [
    { name: 'alpha', active: true },
    { name: 'bravo', active: false },
  ];
  state.setRealm(SENTINEL);
  // the login has mapped the sentinel to the deployment's default by now
  state.setRealm('alpha');
});

describe('realmRowSetup', () => {
  test('offers the realms of the system with the deployment default as the default', async () => {
    const row = await realmRowSetup(await leaf());
    expect(row.label).toBe('realm');
    expect(row.defaultValue).toBe('alpha');
    expect(row.defaultText).toBe('alpha');
    expect(row.choices.map((choice) => choice.name)).toEqual([
      'alpha',
      'bravo',
    ]);
    expect(row.message).toBe('Choose a realm (default: alpha):');
  });

  test('keeps the inactive mark of a realm', async () => {
    const row = await realmRowSetup(await leaf());
    expect(
      row.choices.find((choice) => choice.name === 'bravo').description
    ).toBe('inactive');
    expect(
      row.choices.find((choice) => choice.name === 'alpha').description
    ).toBeUndefined();
  });

  test('has no row for a system with one realm: nothing to choose', async () => {
    realms = [{ name: 'alpha', active: true }];
    expect(await realmRowSetup(await leaf())).toBeUndefined();
  });

  test('has no row when the realms cannot be read: the default is kept', async () => {
    readFails = true;
    expect(await realmRowSetup(await leaf())).toBeUndefined();
  });

  test('gives a default that the realm list does not hold a row of its own, so the user can return to it', async () => {
    // the root realm of a classic deployment is not in the list of realms
    state.setRealm('/');
    const row = await realmRowSetup(await leaf());
    expect(row.defaultValue).toBe('/');
    expect(row.choices.map((choice) => choice.value)).toEqual([
      '/',
      'alpha',
      'bravo',
    ]);
  });

  test('a command that uses its realm has All realms first and as the default', async () => {
    const command = await leaf('config-manager', 'journeys');
    declareRealmUse(command, { tenantWide: false });
    const row = await realmRowSetup(command);
    expect(row.choices.map((choice) => choice.name)).toEqual([
      'All realms',
      'alpha',
      'bravo',
    ]);
    expect(row.defaultValue).toBe(row.choices[0].value);
    expect(row.defaultText).toBe('All realms');
    expect(row.message).toBe('Choose a realm (All realms is the default):');
  });

  test('says that a realm limits the realm-specific part only for a command that also covers the tenant', async () => {
    const command = await leaf('config-manager', 'all');
    declareRealmUse(command, { tenantWide: true });
    const row = await realmRowSetup(command);
    expect(row.message).toBe(
      'Choose a realm (realm-specific config only; tenant-wide config is always included):'
    );
  });
});

describe('realmForPreview', () => {
  test('shows All realms as the sentinel and any other realm as itself', async () => {
    const command = await leaf('config-manager', 'journeys');
    declareRealmUse(command, { tenantWide: false });
    const row = await realmRowSetup(command);
    expect(realmForPreview(row.defaultValue)).toBe(SENTINEL);
    expect(realmForPreview('bravo')).toBe('bravo');
  });
});

describe('applyRealmRowChoice', () => {
  test('writes a chosen realm to the state and to the realm positional, on both surfaces', async () => {
    const command = await leaf();
    const row = await realmRowSetup(command);
    applyRealmRowChoice(command, row, 'bravo');
    expect(state.getRealm()).toBe('bravo');
    expect(positionalValue(command, 'realm')).toBe('bravo');
    expect(command.args[1]).toBe('bravo');
    expect(realmOfRun(command, SENTINEL)).toBe('bravo');
  });

  test('writes the plain name, as the user would type it', async () => {
    const command = await leaf();
    const row = await realmRowSetup(command);
    applyRealmRowChoice(command, row, '/parent/child');
    expect(state.getRealm()).toBe('/parent/child');
    expect(positionalValue(command, 'realm')).toBe('parent/child');
  });

  test('keeps the default when nothing was chosen: nothing is written', async () => {
    const command = await leaf();
    const row = await realmRowSetup(command);
    applyRealmRowChoice(command, row, undefined);
    expect(state.getRealm()).toBe('alpha');
    expect(realmOfRun(command, SENTINEL)).toBe(SENTINEL);
  });

  test('a command that uses its realm: All realms writes nothing, the deployment default narrows the run', async () => {
    const command = await leaf('config-manager', 'journeys');
    declareRealmUse(command, { tenantWide: false });
    const row = await realmRowSetup(command);
    applyRealmRowChoice(command, row, row.choices[0].value);
    expect(state.getRealm()).toBe('alpha');
    expect(realmOfRun(command, SENTINEL)).toBe(SENTINEL);
    applyRealmRowChoice(command, row, 'alpha');
    expect(realmOfRun(command, SENTINEL)).toBe('alpha');
  });
});
