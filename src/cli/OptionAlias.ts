import { Command, Option } from 'commander';

/**
 * Extra spellings of one option, for the selectors of the configuration
 * commands: `-i, --journey-id <id>` keeps `-n` and `--name` as spellings of
 * the same option, one attribute (`journeyId`), one help row, one value
 * (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md,
 * options of the configuration commands: `-n, --name` stays as a documented
 * permanent alias).
 *
 * Commander finds the option of a typed flag with `option.is(arg)`, for `-n x`,
 * `--name x`, `--name=x` and for a letter inside a cluster (`-yn x`), and it
 * refuses a second option that declares the same letter. `withOptionAlias`
 * overrides `is` as an OWN property of the option, so a command that registers
 * the option with plain commander and `FrodoCommand.addOption`, which clones
 * it, both keep the alias (`copyOptionAliases` makes the clone's own
 * property).
 *
 * This module imports nothing of FrodoCommand: the unit tests that replace
 * FrodoCommand with a stub keep the alias on the options of a command file.
 */

/** Where the spellings of an option are kept; the double underscore avoids commander's own names. */
const OPTION_ALIASES_KEY = '__frodoOptionAliases' as const;

/** Commander does not type `Option.is`, which finds the option for a typed flag. */
type OptionWithIs = Option & { is(arg: string): boolean };

type AliasedOption = Option & { [OPTION_ALIASES_KEY]?: string[] };

/** A spelling is a short flag (`-n`) or a long flag (`--name`). */
const SPELLING = /^(?:-[A-Za-z]|--[a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/;

/**
 * The extra spellings of an option, in the order they were declared.
 * @param option Option to read.
 * @returns A copy of the spellings, empty for an option without an alias.
 */
export function getOptionAliases(option: Option): string[] {
  return [...((option as AliasedOption)[OPTION_ALIASES_KEY] ?? [])];
}

/**
 * Lets the option answer to extra spellings: sets the list and overrides `is`
 * as own, non-enumerable properties.
 * @param option Option that gets the spellings.
 * @param spellings Spellings, each `-x` or `--long-name`.
 * @throws {Error} for a spelling that is not a flag, that the option already
 * has, or that stands twice
 */
function acceptSpellings(option: Option, spellings: string[]): void {
  const taken = new Set<string>(
    [option.short, option.long].filter((flag): flag is string => !!flag)
  );
  for (const spelling of spellings) {
    if (!SPELLING.test(spelling)) {
      throw new Error(
        `Option alias '${spelling}' of '${option.flags}' is not a flag: write -x or --long-name`
      );
    }
    if (taken.has(spelling)) {
      throw new Error(
        `Option alias '${spelling}' of '${option.flags}' is already a spelling of the option`
      );
    }
    taken.add(spelling);
  }
  Object.defineProperty(option, OPTION_ALIASES_KEY, {
    value: [...spellings],
    enumerable: false,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(option, 'is', {
    value(this: Option, arg: string): boolean {
      return (
        (Option.prototype as OptionWithIs).is.call(this, arg) ||
        getOptionAliases(this).includes(arg)
      );
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

/**
 * Gives an option extra spellings and names them at the end of its
 * description in one fixed form, `(alias: -n, --name)`, as
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0049-an-alias-is-named-in-the-description-and-the-old-name-of-a-renamed-command-stays-as-a-transition-alias.md
 * (an alias is named in the description) does for the aliases of a command.
 * Every spelling sets the attribute of the option.
 * @param option Option to annotate; its description should end its own text.
 * @param spellings Extra spellings, each `-x` or `--long-name`.
 * @returns Same option for chaining.
 * @throws {Error} for a spelling that is not a flag, that the option already
 * has, or that stands twice, and for an option that has an alias already
 */
export function withOptionAlias(option: Option, spellings: string[]): Option {
  if (getOptionAliases(option).length > 0) {
    throw new Error(`Option '${option.flags}' has an alias already`);
  }
  if (spellings.length === 0) {
    throw new Error(`Option '${option.flags}': name at least one spelling`);
  }
  acceptSpellings(option, spellings);
  option.description = `${option.description} (alias: ${spellings.join(', ')})`;
  return option;
}

/**
 * Makes the spellings of one option those of another: for the copy that
 * `FrodoCommand.addOption` makes of every option. The description is not
 * touched, the copy has the note already.
 * @param from Option that has the spellings.
 * @param to Copy of that option.
 */
export function copyOptionAliases(from: Option, to: Option): void {
  const spellings = getOptionAliases(from);
  if (spellings.length > 0) acceptSpellings(to, spellings);
}

/**
 * Refuses an option whose alias spelling is already taken by an option of the
 * command, with the message commander gives for two options that declare the
 * same flag. Commander compares the flags of a new option with the options it
 * has (and their aliases, through `is`); the alias spellings of the new option
 * it does not know, so an aliased option that is registered after the option
 * that owns `-n` would stay dead behind it without a word.
 * @param command Command that is about to get the option.
 * @param option Option to be registered.
 * @throws {Error} when an alias spelling of the option is used by another option
 */
export function assertAliasesFree(command: Command, option: Option): void {
  for (const spelling of getOptionAliases(option)) {
    const taken = command.options.find((other) =>
      (other as OptionWithIs).is(spelling)
    );
    if (taken) {
      throw new Error(
        `Cannot add option '${option.flags}'${command.name() && ` to command '${command.name()}'`} due to conflicting flag '${spelling}'\n-  already used by option '${taken.flags}'`
      );
    }
  }
}
