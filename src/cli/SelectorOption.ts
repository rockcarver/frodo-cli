import { InvalidArgumentError, Option } from 'commander';
import { withOptionAlias } from './OptionAlias.js';

/**
 * The option that selects one object of a configuration command: `-i,
 * --<type>-id <id>` by its identifier, `-n, --<type>-name <name>` by a name
 * that can change, with the permanent alias `-n, --name` where the command had
 * it (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md,
 * options of the configuration commands).
 *
 * An empty value never selects all objects: a script that passes `-i
 * "$ID"` with an empty variable must not pull, push or delete everything. The
 * value is refused while the command line is parsed, so before the command
 * connects to anything and for every spelling of the option (`-i ""`,
 * `--journey-id=`, the alias `--name ""`); commander names the option in its
 * message and the exit code is 1.
 */

/**
 * The parser of a selector: the value as it was typed, unless it is empty.
 * @param value The value of the option.
 * @returns The value.
 * @throws {InvalidArgumentError} when the value is empty
 */
export function refuseEmptySelector(value: string): string {
  if (value === '') {
    throw new InvalidArgumentError(
      'An empty value never selects all objects: leave the option out to select all.'
    );
  }
  return value;
}

/**
 * Creates the option of a selector, which refuses an empty value.
 * @param flags The flags, `-i, --journey-id <id>`.
 * @param description The description, without the note of the alias.
 * @param aliases Extra spellings that answer to the option, `['-n', '--name']`
 * on `-i`, `['--name']` on `-n`; none for a command that had no `--name`.
 * @returns The option; chain `.conflicts([...])` for the other selector.
 */
export function selectorOption(
  flags: string,
  description: string,
  aliases: string[] = []
): Option {
  const option = new Option(flags, description).argParser(refuseEmptySelector);
  return aliases.length > 0 ? withOptionAlias(option, aliases) : option;
}
