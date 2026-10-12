/**
 * The invocation editor's candidate list and the discoverability
 * hint derived from it (docs/INTERACTIVE-COMMANDS.md), split into a
 * zero-import module the same way PromptGateState/ActiveActionCommandState
 * are: pickers in this directory (EntityPickers, RealmPickers) attach the
 * hint to their prompts, and the editor in cli/ResolveInteractiveInputs
 * consumes the same list -- one shared source of truth, so the
 * "(→ N options to configure)" count is always the truthful promise the
 * editor delivers on.
 *
 * Pure commander logic, no frodo-lib: importable from anywhere without
 * dragging heavy graphs into tests that mock frodo-lib wholesale.
 */

import type { Command, Option } from 'commander';

/**
 * The command's editable options for this invocation -- the exact
 * candidate list the invocation editor offers: options not yet valued,
 * PLUS already-valued ones (editing what was given
 * is the point of an editor; the value step pre-fills the current
 * value). Non-editable machinery (help/version/prompting) never counts.
 */
export function editableOptionalOptions(command: Command): Option[] {
  return command.options.filter((option) => {
    // Help/version/prompt machinery is not an editable option. The
    // prompting switch is a dual option pair (--prompt + --no-prompt)
    // sharing the `prompt` attribute -- BOTH name() spellings excluded.
    if (
      option.name() === 'help' ||
      option.name() === 'help-more' ||
      option.name() === 'help-all' ||
      option.name() === 'version' ||
      option.name() === 'prompt' ||
      option.name() === 'no-prompt' ||
      option.name() === 'edit' ||
      option.name() === 'save-defaults'
    ) {
      return false;
    }
    return true;
  });
}

/**
 * The discoverability hint for `command`'s pickers: a counted
 * promise of what pressing → opens. Undefined when there is nothing to
 * configure -- silence means done, so pickers without a hint keep the
 * → key unclaimed.
 */
export function editableOptionsHint(command: Command): string | undefined {
  const count = editableOptionalOptions(command).length;
  return count > 0 ? `→ ${count} options to configure` : undefined;
}
