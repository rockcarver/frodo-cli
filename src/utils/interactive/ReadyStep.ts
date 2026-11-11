/**
 * The pure parts of the Ready step (records 0043 and 0044), split into a zero-import
 * module the same way PromptGateState and EditableOptions are: the resolution
 * pass (cli/ResolveInteractiveInputs) cannot be imported by the unit tests,
 * and these are the decisions that need a test.
 *
 * An interactive session that asked for anything ends in one more prompt, the
 * Ready step: the command as it will run, and the choice to run it, to edit
 * its options or to cancel. Until then no prompt of the resolution pass runs
 * the command, and each says so with `NEXT_LABEL` on its Enter key; the Ready
 * step's Enter is the only one that does. It is the LAST prompt of the pass
 * (record 0044): the pickers that need a login run before it, in the pass,
 * after the login the pass makes for them.
 */

import type { EscapableSelectChoice } from './EscapableSelectPrompt';

/** What Enter says on every prompt of the resolution pass: more follows, at least the Ready step. */
export const NEXT_LABEL = 'next';

/** What Enter does on the Ready step's rows. */
export type ReadyAnswer = 'run' | 'edit' | 'cancel';

/**
 * Whether the Ready step is asked: only when the resolution pass itself put at
 * least one prompt on the screen. A complete command line renders none, so it
 * never sees the step (record 0047); neither does a run that may not prompt.
 * @param promptsBefore prompts rendered in the process when the pass began
 * @param promptsAfter prompts rendered in the process when the pass ended
 * @returns true when the pass rendered a prompt
 */
export function readyStepWanted(
  promptsBefore: number,
  promptsAfter: number
): boolean {
  return promptsAfter > promptsBefore;
}

/**
 * What Enter does on the highlighted row of the Ready step, for the Navigate
 * menu. Empty when no row is highlighted (the filter matched nothing), which
 * hides the key: Enter does nothing then.
 * @param highlighted the value of the highlighted row
 * @returns the Enter label
 */
export function readyEnterLabel(highlighted: unknown): string {
  switch (highlighted) {
    case 'run':
      return 'run';
    case 'edit':
      return 'edit options';
    case 'cancel':
      return 'cancel';
    default:
      return '';
  }
}

/** The Escape label of the Ready step: there is nothing to go back to, it ends the session. */
export const READY_ESCAPE_LABEL = 'cancel';

/**
 * The rows of the Ready step: Run first (the default), Edit options only when
 * the command has options left to edit, Cancel last.
 * @param options.canEdit whether the invocation editor has anything to offer
 * @returns the rows
 */
export function readyChoices(options: {
  canEdit: boolean;
}): EscapableSelectChoice<ReadyAnswer>[] {
  const choices: EscapableSelectChoice<ReadyAnswer>[] = [
    {
      value: 'run',
      name: 'Run',
      description: 'Run the command shown below.',
    },
  ];
  if (options.canEdit) {
    choices.push({
      value: 'edit',
      name: 'Edit options',
      description:
        'Set or change optional options of this command, then come back here.',
    });
  }
  choices.push({
    value: 'cancel',
    name: 'Cancel',
    description: 'Do not run anything.',
  });
  return choices;
}
