import { afterEach, describe, expect, it } from '@jest/globals';
import { Command } from 'commander';
import {
  serializeCommand,
  setDeploymentTypeForPreview,
} from './CommandPreview';
import { realmOfRun } from './PositionalArgs';
import {
  declareRealmPickerOnlyWith,
  declareRealmUse,
  ignoresRealm,
  isConfigManagerCommand,
  realmPickerOptionOf,
  realmPickerWanted,
  realmUseOf,
} from './RealmUse';

const SENTINEL = '__default__realm__';

/** A parsed leaf under `frodo config-manager pull`, with the realm positional. */
async function leaf(
  args: string[],
  group = 'config-manager'
): Promise<Command> {
  const root = new Command('frodo');
  const groupCommand = root.command(group);
  const pull = groupCommand.command('pull');
  const command = pull
    .command('journeys')
    .argument('[host]')
    .argument('[realm]', 'Realm.', SENTINEL)
    .action(async () => {});
  await root.parseAsync(['node', 'frodo', group, 'pull', 'journeys', ...args]);
  return command;
}

afterEach(() => {
  setDeploymentTypeForPreview(undefined);
});

describe('what a command declares about its realm', () => {
  it('records nothing until the command declares it', async () => {
    const command = await leaf(['matrix']);
    expect(realmUseOf(command)).toBeUndefined();
  });

  it('records a declaration, with the tenant-wide flag off unless it is given', async () => {
    const plain = await leaf(['matrix']);
    declareRealmUse(plain);
    expect(realmUseOf(plain)).toEqual({ tenantWide: false });
    const wide = await leaf(['matrix']);
    declareRealmUse(wide, { tenantWide: true });
    expect(realmUseOf(wide)).toEqual({ tenantWide: true });
  });

  it('keeps one command apart from another', async () => {
    const declared = await leaf(['matrix']);
    const other = await leaf(['matrix']);
    declareRealmUse(declared);
    expect(realmUseOf(other)).toBeUndefined();
  });
});

describe('isConfigManagerCommand and ignoresRealm', () => {
  it('knows a command under config-manager by its group', async () => {
    expect(isConfigManagerCommand(await leaf(['matrix']))).toBe(true);
    expect(isConfigManagerCommand(await leaf(['matrix'], 'journey'))).toBe(
      false
    );
  });

  it('knows a leaf that carries its full name', () => {
    expect(
      isConfigManagerCommand(new Command('frodo config-manager pull all'))
    ).toBe(true);
    expect(isConfigManagerCommand(new Command('frodo journey list'))).toBe(
      false
    );
  });

  it('ignores the realm of a config-manager command that did not declare it', async () => {
    const command = await leaf(['matrix']);
    expect(ignoresRealm(command)).toBe(true);
    declareRealmUse(command);
    expect(ignoresRealm(command)).toBe(false);
  });

  it('never ignores the realm of a command outside config-manager', async () => {
    expect(ignoresRealm(await leaf(['matrix'], 'journey'))).toBe(false);
  });
});

describe('realmOfRun', () => {
  it('is the value the parameter has when nothing was picked: the sentinel default', async () => {
    const command = await leaf(['matrix']);
    expect(realmOfRun(command, SENTINEL)).toBe(SENTINEL);
  });

  it('is the realm the user typed', async () => {
    const command = await leaf(['matrix', 'alpha']);
    expect(realmOfRun(command, 'alpha')).toBe('alpha');
  });

  it('is a realm that was written after the action bound its parameter', async () => {
    const command = await leaf(['matrix']);
    const bound = SENTINEL;
    // what the post-auth realm picker does (setPositionalValueForCommand)
    command.processedArgs[1] = 'bravo';
    expect(realmOfRun(command, bound)).toBe('bravo');
  });

  it('falls back to the parameter for a command without a realm positional', () => {
    const command = new Command('frodo config-manager pull cors');
    expect(realmOfRun(command, 'alpha')).toBe('alpha');
    expect(realmOfRun(command, undefined)).toBeUndefined();
  });
});

describe('the command as the preview prints it', () => {
  it('prints the deployment default for the sentinel of an ordinary command', async () => {
    setDeploymentTypeForPreview('cloud');
    const command = await leaf(['matrix']);
    expect(serializeCommand(command)).toBe(
      'frodo config-manager pull journeys matrix alpha'
    );
  });

  it('prints no realm for the sentinel of a command that uses its realm: it runs in every realm', async () => {
    setDeploymentTypeForPreview('cloud');
    const command = await leaf(['matrix']);
    declareRealmUse(command);
    expect(serializeCommand(command)).toBe(
      'frodo config-manager pull journeys matrix'
    );
  });

  it('prints a realm that was picked, for a command that uses its realm', async () => {
    setDeploymentTypeForPreview('cloud');
    const command = await leaf(['matrix']);
    declareRealmUse(command);
    command.processedArgs[1] = 'bravo';
    expect(serializeCommand(command)).toBe(
      'frodo config-manager pull journeys matrix bravo'
    );
  });

  it('prints the realm that was typed, for a command that uses its realm', async () => {
    const command = await leaf(['matrix', 'alpha']);
    declareRealmUse(command);
    expect(serializeCommand(command)).toBe(
      'frodo config-manager pull journeys matrix alpha'
    );
  });
});

/** A parsed `frodo config export` with the realm positional and `-r, --realm-only`. */
async function exportLeaf(args: string[]): Promise<Command> {
  const root = new Command('frodo');
  const command = root
    .command('config')
    .command('export')
    .argument('[host]')
    .argument('[realm]', 'Realm.', SENTINEL)
    .option('-a, --all')
    .option('-r, --realm-only')
    .action(async () => {});
  await root.parseAsync(['node', 'frodo', 'config', 'export', ...args]);
  return command;
}

describe('a realm picker that needs an option', () => {
  it('records nothing until the command declares it, and then wants the picker as before', async () => {
    const command = await exportLeaf(['matrix']);
    expect(realmPickerOptionOf(command)).toBeUndefined();
    expect(realmPickerWanted(command)).toBe(true);
  });

  it('records the option', async () => {
    const command = await exportLeaf(['matrix']);
    declareRealmPickerOnlyWith(command, 'realmOnly');
    expect(realmPickerOptionOf(command)).toBe('realmOnly');
  });

  it('does not want the picker while the option is not set', async () => {
    const command = await exportLeaf(['matrix', '-a']);
    declareRealmPickerOnlyWith(command, 'realmOnly');
    expect(realmPickerWanted(command)).toBe(false);
  });

  it('wants the picker when the option is set, alone or in a cluster of flags', async () => {
    const alone = await exportLeaf(['matrix', '-r']);
    declareRealmPickerOnlyWith(alone, 'realmOnly');
    expect(realmPickerWanted(alone)).toBe(true);
    const clustered = await exportLeaf(['-ar']);
    declareRealmPickerOnlyWith(clustered, 'realmOnly');
    expect(realmPickerWanted(clustered)).toBe(true);
  });

  it('is not changed by a realm that was typed: that is judged elsewhere', async () => {
    const command = await exportLeaf(['matrix', 'bravo', '-a']);
    declareRealmPickerOnlyWith(command, 'realmOnly');
    expect(realmPickerWanted(command)).toBe(false);
    const withOption = await exportLeaf(['matrix', 'bravo', '-r']);
    declareRealmPickerOnlyWith(withOption, 'realmOnly');
    expect(realmPickerWanted(withOption)).toBe(true);
  });

  it('keeps one command apart from another', async () => {
    const declared = await exportLeaf(['matrix']);
    const other = await exportLeaf(['matrix']);
    declareRealmPickerOnlyWith(declared, 'realmOnly');
    expect(realmPickerOptionOf(other)).toBeUndefined();
    expect(realmPickerWanted(other)).toBe(true);
  });

  it('does not make a config-manager command use or ignore its realm', async () => {
    const command = await exportLeaf(['matrix']);
    declareRealmPickerOnlyWith(command, 'realmOnly');
    expect(realmUseOf(command)).toBeUndefined();
    expect(ignoresRealm(command)).toBe(false);
  });
});
