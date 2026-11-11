import { Command } from 'commander';
import { registerEntityPickFamily } from '../../src/utils/interactive/EntityPickRegistry.ts';

let families = 0;

/**
 * Gives a command a command family of its own with these picks, the way the
 * registry gives them to a family of commands (decision record 0038). The
 * registry is shared by the whole test file, so every call makes a family no
 * other test uses: the command is put below a group named for it.
 *
 * @param {import('commander').Command} command the command that gets the picks
 * @param {object[]} picks the entity picks (`entityPick({...})`)
 * @param {object} [entry] more of the family entry (`include`, `except`, ...)
 * @returns {import('commander').Command} the command
 */
export function withPicks(command, picks, entry = {}) {
  const group = new Command(`pickfamily${families++}`);
  group.addCommand(command);
  registerEntityPickFamily({ family: group.name(), ...entry, picks });
  return command;
}
