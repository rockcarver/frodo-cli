import { errorMessage } from '../../utils/Console';
import {
  escapableSelect,
  ESCAPE,
} from '../../utils/interactive/EscapableSelectPrompt';
import { EXIT_ALL_SIGNAL } from '../../utils/interactive/ExitAll';
import { canPrompt } from '../../utils/interactive/PromptGateState';
import { FrodoStubCommand, STEP_BACK_FROM_ACTION } from '../FrodoCommand';
import DefaultsCmd from './settings-defaults';
import GuidedCmd from './settings-guided';
import ThemeCmd, { runInteractiveThemePicker } from './settings-theme';

/**
 * Settings categories available in the interactive menu. `theme` is the
 * only one today; this list is exactly where a future settings area (e.g.
 * a `frodo settings log-noise-filter` surface for the currently
 * hand-edit-only LoggingNoiseFilter.json) would be added. Each category's
 * `run` returns `false` if the user backed out of it via Escape without
 * choosing anything, so this menu can loop back instead of exiting.
 */
const CATEGORIES: { name: string; run: () => Promise<boolean> }[] = [
  { name: 'Theme', run: runInteractiveThemePicker },
];

export default function setup() {
  const program = new FrodoStubCommand('settings')
    // Summary/description split (same pattern as login-setup and conn):
    // one line in the parent's list, full detail (with the bare-
    // invocation behavior) on this command's own -h.
    .summary('Manage CLI settings.')
    .description(
      'Manage CLI settings.\n\n' +
        'Run without a sub-command to open the interactive settings menu.'
    );

  program.addCommand(ThemeCmd().name('theme'));
  program.addCommand(GuidedCmd().name('guided'));
  program.addCommand(DefaultsCmd().name('defaults'));

  program.action(async () => {
    try {
      // Gate-respecting: --no-prompt, FRODO_NO_PROMPT, FRODO_TEST, and
      // non-TTY sessions leave the bare invocation a no-op -- the bare
      // action must not prompt when prompting is disallowed.
      if (!canPrompt()) throw STEP_BACK_FROM_ACTION;
      // With only one category, there's nothing to actually choose --
      // skip straight into it. Its own Escape then has no real "category
      // menu" to go back up to, so it climbs OUT of the bare mode (the
      // framework re-opens this stub's sub-command picker, Run row
      // first) instead of exiting the session.
      if (CATEGORIES.length === 1) {
        const applied = await CATEGORIES[0].run();
        if (!applied) throw STEP_BACK_FROM_ACTION;
        return;
      }

      while (true) {
        const category = await escapableSelect({
          message: 'Choose a settings category:',
          choices: CATEGORIES.map((cat) => ({
            name: cat.name,
            value: cat.name,
          })),
        });
        if (category === ESCAPE) throw STEP_BACK_FROM_ACTION;
        const chosen = CATEGORIES.find((cat) => cat.name === category);
        const applied = await chosen.run();
        if (applied) return;
        // user escaped back out of the category -- loop, show the menu again
      }
    } catch (error) {
      if (
        error === STEP_BACK_FROM_ACTION ||
        error === EXIT_ALL_SIGNAL // exit-all unwinds to the shell
      )
        throw error;
      errorMessage(`${error}`);
      process.exitCode = 1;
    }
  });

  return program;
}
