import { describe, expect, it } from '@jest/globals';
import { Command, Option } from 'commander';
import { FrodoCommand } from '../../src/cli/FrodoCommand.ts';
import {
  copyOptionAliases,
  getOptionAliases,
  withOptionAlias,
} from '../../src/cli/OptionAlias.ts';

/**
 * An option can answer to extra spellings: `-i, --journey-id <id>` keeps `-n`
 * and `--name`, as one option with one attribute and one help row, for the
 * selectors of the configuration commands:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
 * (options of the configuration commands: `-n, --name` stays as a documented
 * permanent alias). The description ends with the note `(alias: -n, --name)`,
 * the form that
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0049-an-alias-is-named-in-the-description-and-the-old-name-of-a-renamed-command-stays-as-a-transition-alias.md
 * (an alias is named in the description) reads.
 *
 * The first block parses with plain commander, the way the unit tests that
 * replace FrodoCommand with a stub do; the second goes through
 * `FrodoCommand.addOption`, which clones every option and has to keep the
 * spellings.
 */

const ID_SPELLINGS = ['-n', '--name'];

/** `-i, --journey-id <id>` with the alias `-n, --name`, as a command that has `-y` and `-d` too. */
function commandWithIdOption(Base = Command, spellings = ID_SPELLINGS) {
  const command = new Base('frodo test pull journeys').exitOverride();
  command.addOption(
    withOptionAlias(
      new Option('-i, --journey-id <id>', 'Journey id.'),
      spellings
    )
  );
  command.addOption(new Option('-y, --yes', 'Yes.'));
  command.addOption(new Option('-d, --dry-run', 'Dry run.'));
  return command;
}

/** The options a command line sets, parsed without running an action. */
function parsed(command, args) {
  command.parseOptions(args);
  return command.opts();
}

describe('withOptionAlias with plain commander', () => {
  it.each([
    ['the primary short form', ['-i', 'x']],
    ['the primary long form', ['--journey-id', 'x']],
    ['the alias letter', ['-n', 'x']],
    ['the alias long form', ['--name', 'x']],
    ['the alias long form with =', ['--name=x']],
    ['the alias letter with the value attached', ['-nx']],
    ['the alias letter in a cluster', ['-yn', 'x']],
    ['the alias letter after two flags of a cluster', ['-ydn', 'x']],
  ])('sets the one attribute of the option for %s', (_label, args) => {
    expect(parsed(commandWithIdOption(), args)).toMatchObject({
      journeyId: 'x',
    });
  });

  it('keeps the flags of a cluster that holds the alias letter', () => {
    expect(parsed(commandWithIdOption(), ['-ydn', 'x'])).toEqual({
      journeyId: 'x',
      yes: true,
      dryRun: true,
    });
  });

  it('is one option: the last spelling on the line wins, as for a repeated option', () => {
    expect(
      parsed(commandWithIdOption(), ['-i', 'a', '-n', 'b', '--name', 'c'])
    ).toMatchObject({ journeyId: 'c' });
  });

  it('answers to the alias long form alone when that is the only spelling', () => {
    const command = new Command('frodo test pull applications').exitOverride();
    command.addOption(
      withOptionAlias(new Option('-n, --app-name <name>', 'Name.'), ['--name'])
    );

    expect(parsed(command, ['--name', 'x'])).toEqual({ appName: 'x' });
    expect(parsed(command, ['-n', 'y'])).toEqual({ appName: 'y' });
  });

  it('does not answer to a spelling it was not given', () => {
    const command = commandWithIdOption();

    expect(command.parseOptions(['--nam', 'x']).unknown).toEqual([
      '--nam',
      'x',
    ]);
    expect(command.parseOptions(['-z', 'x']).unknown).toEqual(['-z', 'x']);
  });

  it('keeps the letter: a second option on the alias letter is refused', () => {
    const command = commandWithIdOption();

    expect(() =>
      command.addOption(new Option('-n, --journey-name <name>', 'Name.'))
    ).toThrow(/conflicting flag '-n'/);
    expect(() =>
      command.addOption(new Option('--name <name>', 'Name.'))
    ).toThrow(/conflicting flag '--name'/);
  });

  it('shows one row in the help, with the alias at the end of its description', () => {
    const command = commandWithIdOption();
    const row = command.options.find((o) => o.long === '--journey-id');

    expect(
      command.options.filter((o) => o.long === '--journey-id')
    ).toHaveLength(1);
    expect(row.flags).toBe('-i, --journey-id <id>');
    expect(row.description).toBe('Journey id. (alias: -n, --name)');
    // the form that the record on aliases in the description reads (see the header of this file)
    expect(row.description).toMatch(/\((alias(es)?|formerly): [^)]+\)$/);
  });

  it('names the alias once, with the spellings in the order they were given', () => {
    const option = withOptionAlias(
      new Option('-i, --journey-id <id>', 'Journey id.'),
      ['--name', '-n']
    );

    expect(option.description).toBe('Journey id. (alias: --name, -n)');
    expect(getOptionAliases(option)).toEqual(['--name', '-n']);
  });
});

describe('getOptionAliases', () => {
  it('is empty for an option without an alias', () => {
    expect(getOptionAliases(new Option('-i, --journey-id <id>'))).toEqual([]);
  });

  it('returns a copy: changing it does not change the option', () => {
    const option = withOptionAlias(
      new Option('-i, --journey-id <id>', 'Journey id.'),
      ID_SPELLINGS
    );

    getOptionAliases(option).push('--other');

    expect(getOptionAliases(option)).toEqual(ID_SPELLINGS);
    expect(option.is('--other')).toBe(false);
  });
});

describe('withOptionAlias refuses', () => {
  const option = () => new Option('-i, --journey-id <id>', 'Journey id.');

  it.each([
    ['a word that is not a flag', ['name']],
    ['a long flag with one dash', ['-name']],
    ['a short flag with two letters', ['-na']],
    ['an empty spelling', ['']],
    ['upper case in a long flag', ['--Name']],
    ['a spelling the option has already (short)', ['-i']],
    ['a spelling the option has already (long)', ['--journey-id']],
    ['a spelling that stands twice', ['-n', '-n']],
  ])('%s', (_label, spellings) => {
    expect(() => withOptionAlias(option(), spellings)).toThrow(
      /Option alias|name at least one/
    );
  });

  it('an empty list', () => {
    expect(() => withOptionAlias(option(), [])).toThrow(
      /name at least one spelling/
    );
  });

  it('a second alias on one option', () => {
    expect(() =>
      withOptionAlias(withOptionAlias(option(), ['-n']), ['--name'])
    ).toThrow(/has an alias already/);
  });
});

describe('copyOptionAliases', () => {
  it('gives a copy the spellings without touching its description', () => {
    const original = withOptionAlias(
      new Option('-i, --journey-id <id>', 'Journey id.'),
      ID_SPELLINGS
    );
    const copy = new Option(original.flags, original.description);

    copyOptionAliases(original, copy);

    expect(getOptionAliases(copy)).toEqual(ID_SPELLINGS);
    expect(copy.is('-n')).toBe(true);
    expect(copy.description).toBe('Journey id. (alias: -n, --name)');
  });

  it('does nothing for an option without an alias', () => {
    const copy = new Option('-i, --journey-id <id>');

    copyOptionAliases(new Option('-i, --journey-id <id>'), copy);

    expect(getOptionAliases(copy)).toEqual([]);
    expect(copy.is('-n')).toBe(false);
  });
});

describe('withOptionAlias through FrodoCommand.addOption', () => {
  it('keeps the alias on the copy that the command registers', () => {
    const original = withOptionAlias(
      new Option('-i, --journey-id <id>', 'Journey id.'),
      ID_SPELLINGS
    );
    const command = new FrodoCommand('frodo test pull journeys');

    command.addOption(original);
    const registered = command.options.find((o) => o.long === '--journey-id');

    expect(registered).not.toBe(original);
    expect(getOptionAliases(registered)).toEqual(ID_SPELLINGS);
    expect(registered.description).toBe('Journey id. (alias: -n, --name)');
    expect(registered.is('-n')).toBe(true);
    expect(registered.is('--name')).toBe(true);
  });

  it.each([['-i', 'x'], ['-n', 'x'], ['--name', 'x'], ['--name=x']])(
    'parses %s to the attribute of the option',
    (...args) => {
      const command = commandWithIdOption(FrodoCommand);

      expect(parsed(command, args)).toMatchObject({ journeyId: 'x' });
    }
  );

  it.each([
    ['letter', '-n, --journey-name <name>', "conflicting flag '-n'"],
    ['long form', '--name <name>', "conflicting flag '--name'"],
  ])(
    'refuses an aliased option whose alias %s another option owns already, as for the other order',
    (_label, flags, message) => {
      const command = new FrodoCommand('frodo test pull journeys');
      command.addOption(new Option(flags, 'Name.'));

      expect(() =>
        command.addOption(
          withOptionAlias(
            new Option('-i, --journey-id <id>', 'Journey id.'),
            ID_SPELLINGS
          )
        )
      ).toThrow(message);
      // nothing was registered: the option that owns the spelling is the only one
      expect(command.options.some((o) => o.long === '--journey-id')).toBe(
        false
      );
    }
  );

  it('accepts an aliased option next to options that own no spelling of it', () => {
    const command = new FrodoCommand('frodo test pull journeys');
    command.addOption(new Option('-N, --journey-name <name>', 'Name.'));

    expect(() =>
      command.addOption(
        withOptionAlias(
          new Option('-i, --journey-id <id>', 'Journey id.'),
          ID_SPELLINGS
        )
      )
    ).not.toThrow();
  });

  it('refuses a second option on the alias letter, as plain commander does', () => {
    const command = commandWithIdOption(FrodoCommand);

    expect(() =>
      command.addOption(new Option('-n, --journey-name <name>', 'Name.'))
    ).toThrow(/conflicting flag '-n'/);
  });
});
