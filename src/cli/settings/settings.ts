import { errorMessage } from '../../utils/Console';
import {
  escapableSelect,
  ESCAPE,
} from '../../utils/interactive/EscapableSelectPrompt';
import { FrodoStubCommand } from '../FrodoCommand';
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
  const program = new FrodoStubCommand('settings').description(
    'Manage CLI settings.'
  );

  program.addCommand(ThemeCmd().name('theme'));

  program.action(async () => {
    try {
      // With only one category, there's nothing to actually choose --
      // skip straight into it. Its own Escape then has no real "category
      // menu" to go back up to, so it exits the whole command instead of
      // looping back to a single-item menu that would just reopen itself.
      if (CATEGORIES.length === 1) {
        await CATEGORIES[0].run();
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
        if (category === ESCAPE) return;
        const chosen = CATEGORIES.find((cat) => cat.name === category);
        const applied = await chosen.run();
        if (applied) return;
        // user escaped back out of the category -- loop, show the menu again
      }
    } catch (error) {
      errorMessage(`${error}`);
      process.exitCode = 1;
    }
  });

  return program;
}
