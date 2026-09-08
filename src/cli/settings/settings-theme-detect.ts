import { successMessage, warnMessage } from '../../utils/Console';
import {
  activatePersistedTheme,
  detectAndPersistTheme,
} from '../../utils/ThemeConfig';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo settings theme detect',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description(
      "Detect this terminal's actual background color and set it as your background preference (your contrast preference is unaffected). Run this again any time you've switched terminals or changed your terminal's colors -- detection otherwise only ever runs automatically once, the first time no background has been chosen yet."
    )
    .action(async (options, command) => {
      command.handleDefaultArgsAndOpts(options, command);
      const matched = await detectAndPersistTheme();
      if (!matched) {
        warnMessage(
          'Could not detect this terminal\'s background color (not an interactive terminal, or it didn\'t respond to the query in time). Background unchanged -- set one manually with "frodo settings theme background <name>".'
        );
        process.exitCode = 1;
        return;
      }
      activatePersistedTheme();
      successMessage(`Detected background, set to "${matched}".`);
    });

  return program;
}
