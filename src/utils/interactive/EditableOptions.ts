/**
 * The invocation editor's candidate list and the discoverability
 * hint derived from it (docs/INTERACTIVE-COMMANDS.md), split into a
 * zero-import module the same way PromptGateState/ActiveActionCommandState
 * are: pickers in this directory (EntityPickers, RealmPickers) attach the
 * hint to their prompts, and the editor in cli/ResolveInteractiveInputs
 * consumes the same list -- one shared source of truth, so the
 * "(→ N options)" count is always the truthful promise the
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
  return count > 0 ? `→ ${count} options` : undefined;
}

/**
 * One collapsible section in the grouped editor: the help-group id
 * (commander's heading string) and the human label the header renders
 * (`Authentication Options:` -> `Authentication options`).
 */
export type EditableOptionGroup = {
  /** The help-group heading this section folds (the grouping key). */
  id: string;
  /** The header label, e.g. 'Connection options'. */
  label: string;
};

/**
 * Zero-import: `helpGroupHeading` is commander's own Option property;
 * no frodo-lib. Headings 'Options:' and '' mean the command's OWN
 * options -- the group every leaf option lands in unless FrodoCommand
 * assigned a shared heading (the same data the -h/-hh layout uses, so
 * help and the editor can never disagree about where an option
 * belongs).
 */
const COMMAND_SPECIFIC_HEADINGS = new Set(['Options:', '']);

/**
 * The option's editable-group id in the invocation editor:
 * `undefined` = the command's own options (rendered flat, always
 * visible), a heading string = a collapsible shared section.
 */
export function editableOptionGroupOf(option: Option): string | undefined {
  const heading = option.helpGroupHeading ?? '';
  return COMMAND_SPECIFIC_HEADINGS.has(heading) ? undefined : heading;
}

/**
 * The collapsible sections `options` actually populate, ordered
 * alphabetically by heading -- the same order `-hh` help prints the
 * groups in, so the editor and expanded help read alike. Empty groups
 * never render (silence = this command carries no such options).
 */
export function editableOptionGroups(options: Option[]): EditableOptionGroup[] {
  const present = new Set<string>();
  for (const option of options) {
    const group = editableOptionGroupOf(option);
    if (group !== undefined) present.add(group);
  }
  return [...present]
    .sort((a, b) => a.localeCompare(b))
    .map((heading) => ({
      id: heading,
      label: groupLabel(heading),
    }));
}

/** 'Authentication Options:' -> 'Authentication options'. */
function groupLabel(heading: string): string {
  const words = heading.replace(/:$/, '').trim();
  if (words.length === 0) return 'Options';
  // Lowercase the trailing group word only ('options'), never the
  // distinguishing first word ('authentication').
  const parts = words.split(' ');
  parts[parts.length - 1] = parts[parts.length - 1].toLowerCase();
  return parts.join(' ');
}

/**
 * The editor's candidate ORDER: the command's own options first, then
 * the shared groups alphabetically by heading (the -hh order), the
 * dash-insensitive word sort INSIDE each (user feedback 2026-10-12: a
 * flat alphabetical list buries the command's own options among global/
 * connection machinery). Derived from the same grouping helpers the
 * grouped editor renders, so order and sections can never drift apart.
 */
export function sortEditableOptions(options: Option[]): Option[] {
  const groups = editableOptionGroups(options);
  const rankOf = (option: Option): number => {
    const group = editableOptionGroupOf(option);
    return group === undefined ? -1 : groups.findIndex((g) => g.id === group);
  };
  const label = (option: Option): string => {
    const words = option.flags
      .split(/[, ]+/)
      .filter((token) => token.startsWith('-'))
      .map((token) => token.replace(/^-+/, ''))
      .filter((word) => !/^[<[]/.test(word));
    return words.join(' ').toLowerCase();
  };
  return [...options].sort((a, b) => {
    const rankA = rankOf(a);
    const rankB = rankOf(b);
    if (rankA !== rankB) return rankA - rankB;
    return label(a).localeCompare(label(b));
  });
}
