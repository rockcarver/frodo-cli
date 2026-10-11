/**
 * The invocation editor's candidate list and the Phase 5 discoverability
 * hint derived from it (INTERACTIVE-COMMANDS-PLAN.md), split into a
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
 * The command's optional options that are not valued on this invocation
 * -- the exact candidate list the invocation editor offers. Non-editable
 * machinery (help/version/prompt/edit) never counts.
 */
export function editableOptionalOptions(command: Command): Option[] {
  return command.options.filter((option) => {
    // Help/version/prompt machinery is not an editable option.
    if (
      option.name() === 'help' ||
      option.name() === 'help-more' ||
      option.name() === 'help-all' ||
      option.name() === 'version' ||
      option.name() === 'prompt' ||
      option.name() === 'edit'
    ) {
      return false;
    }
    // Only options NOT already valued on this invocation.
    const value = command.getOptionValue(option.attributeName());
    return value === undefined || value === false;
  });
}

/**
 * The Phase 5 discoverability hint for `command`'s pickers: a counted
 * promise of what pressing → opens. Undefined when there is nothing to
 * configure -- silence means done, so pickers without a hint keep the
 * → key unclaimed.
 */
export function editableOptionsHint(command: Command): string | undefined {
  const count = editableOptionalOptions(command).length;
  return count > 0 ? `→ ${count} options to configure` : undefined;
}
