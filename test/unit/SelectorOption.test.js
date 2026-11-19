import { describe, expect, it } from '@jest/globals';
import { Command, Option } from 'commander';
import { FrodoCommand } from '../../src/cli/FrodoCommand.ts';
import { getOptionAliases } from '../../src/cli/OptionAlias.ts';
import {
  refuseEmptySelector,
  selectorOption,
} from '../../src/cli/SelectorOption.ts';

/**
 * The option of a selector (`-i, --<type>-id`, `-n, --<type>-name`) refuses an
 * empty value while the command line is parsed, so that a variable that
 * expands to nothing (`-i "$ID"`) can never turn the selection of one object
 * into all objects, whatever the command does with the value:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
 * (options of the configuration commands). The rows of the real commands are
 * checked in ConfigManagerSelectors.test.js.
 */

const strict = (command) =>
  command
    .exitOverride()
    .configureOutput({ writeErr: () => {}, writeOut: () => {} });

/** A command with the identifier selector and the alias `-n, --name`. */
function commandWith(Base = Command) {
  const command = strict(new Base('frodo test pull journeys'));
  command.addOption(
    selectorOption('-i, --journey-id <id>', 'Journey id.', ['-n', '--name'])
  );
  command.action(() => {});
  return command;
}

const parse = (command, args) => {
  command.parse(args, { from: 'user' });
  return command.opts();
};

describe('refuseEmptySelector', () => {
  it('returns a value as it was typed', () => {
    expect(refuseEmptySelector('x')).toBe('x');
    expect(refuseEmptySelector(' ')).toBe(' ');
    expect(refuseEmptySelector('0')).toBe('0');
  });

  it('refuses an empty value, and says that an empty value never selects all', () => {
    expect(() => refuseEmptySelector('')).toThrow(
      /An empty value never selects all objects/
    );
  });
});

describe('selectorOption', () => {
  it('creates an option with the flags and the description, and no alias by default', () => {
    const option = selectorOption('-i, --journey-id <id>', 'Journey id.');

    expect(option.flags).toBe('-i, --journey-id <id>');
    expect(option.description).toBe('Journey id.');
    expect(getOptionAliases(option)).toEqual([]);
  });

  it('gives the alias, and the note at the end of the description', () => {
    const option = selectorOption('-i, --journey-id <id>', 'Journey id.', [
      '-n',
      '--name',
    ]);

    expect(getOptionAliases(option)).toEqual(['-n', '--name']);
    expect(option.description).toBe('Journey id. (alias: -n, --name)');
  });

  it.each([
    ['-i', ''],
    ['--journey-id', ''],
    ['-n', ''],
    ['--name', ''],
  ])(
    'refuses %s with an empty value, naming the option, before any action runs',
    (flag, value) => {
      const command = commandWith();
      let ran = false;
      command.action(() => {
        ran = true;
      });

      let error;
      try {
        command.parse([flag, value], { from: 'user' });
      } catch (caught) {
        error = caught;
      }

      expect(error?.code).toBe('commander.invalidArgument');
      expect(error.exitCode).toBe(1);
      expect(error.message).toContain("option '-i, --journey-id <id>'");
      expect(error.message).toContain(
        'An empty value never selects all objects'
      );
      expect(ran).toBe(false);
    }
  );

  it.each([['--journey-id='], ['--name=']])(
    'refuses %s, an empty value with an equals sign',
    (flag) => {
      expect(() => parse(commandWith(), [flag])).toThrow(
        /An empty value never selects all objects/
      );
    }
  );

  it('refuses it through FrodoCommand, which clones every option', () => {
    expect(() => parse(commandWith(FrodoCommand), ['-n', ''])).toThrow(
      /An empty value never selects all objects/
    );
  });

  it('takes a value that is not empty, in every spelling', () => {
    for (const args of [
      ['-i', 'x'],
      ['--name', 'x'],
      ['-n', ' '],
    ]) {
      expect(parse(commandWith(), args).journeyId).toBe(args[1]);
    }
  });

  it('is what the option of a plain commander Option does not do: an empty value passes without it', () => {
    const command = strict(new Command('x'));
    command.addOption(new Option('-i, --journey-id <id>', 'Journey id.'));
    command.action(() => {});

    expect(parse(command, ['-i', '']).journeyId).toBe('');
  });
});
