import { beforeAll, describe, expect, it } from '@jest/globals';
import { FrodoCommand } from '../../src/cli/FrodoCommand.ts';
import {
  realmPickerOptionOf,
  realmUseOf,
} from '../../src/utils/interactive/RealmUse.ts';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';

/**
 * A command whose realm matters only when an option is set declares it with
 * `.realmPickerOnlyWith(option)` (src/utils/interactive/RealmUse.ts): its
 * post-auth realm picker may then open only with that option. `frodo config
 * export` is the one such command: the realm limits the export with `-r`,
 * `--realm-only` (a boolean flag; the realm itself is the positional after the
 * host) and changes nothing without it.
 */
const DECLARING = {
  'frodo config export': { attribute: 'realmOnly', flags: '-r, --realm-only' },
};

let leaves = [];

beforeAll(async () => {
  leaves = await loadLeafCommands();
});

describe('commands whose realm picker needs an option', () => {
  it('are exactly the ones listed here', () => {
    const declared = leaves
      .filter((leaf) => realmPickerOptionOf(leaf))
      .map(fullName)
      .sort();
    expect(declared).toEqual(Object.keys(DECLARING).sort());
  });

  it('name an option that the command has, as a flag without a value', () => {
    for (const [name, expected] of Object.entries(DECLARING)) {
      const command = leaves.find((leaf) => fullName(leaf) === name);
      expect(realmPickerOptionOf(command)).toBe(expected.attribute);
      const option = command.options.find(
        (o) => o.attributeName() === expected.attribute
      );
      expect(option.flags).toBe(expected.flags);
      // a flag: it takes no value, so `-ar <connection>` keeps its meaning
      expect(option.required).toBeFalsy();
      expect(option.optional).toBeFalsy();
      // and the command keeps its realm positional
      expect(command.registeredArguments.map((a) => a.name())).toContain(
        'realm'
      );
    }
  });

  it('do not use their realm the way a config-manager command does', () => {
    for (const leaf of leaves.filter((l) => realmPickerOptionOf(l))) {
      expect(realmUseOf(leaf)).toBeUndefined();
    }
  });
});

describe('FrodoCommand.realmPickerOnlyWith', () => {
  it('records an option that the command has', () => {
    const command = new FrodoCommand('frodo widget export');
    command.option('-r, --realm-only');
    expect(command.realmPickerOnlyWith('realmOnly')).toBe(command);
    expect(realmPickerOptionOf(command)).toBe('realmOnly');
  });

  it('refuses an option that the command does not have', () => {
    const command = new FrodoCommand('frodo widget export');
    expect(() => command.realmPickerOnlyWith('realmOnly')).toThrow(
      /names an option the command does not have/
    );
  });
});
