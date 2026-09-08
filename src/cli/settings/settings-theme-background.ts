import { errorMessage, successMessage } from '../../utils/Console';
import {
  activatePersistedTheme,
  type Background,
  BACKGROUNDS,
  setActiveBackground,
} from '../../utils/ThemeConfig';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo settings theme background',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description(
      'Set the background color preference (your contrast preference is unaffected).'
    )
    .argument('name', `Background to use. One of: ${BACKGROUNDS.join(', ')}.`)
    .action(async (name, options, command) => {
      command.handleDefaultArgsAndOpts(name, options, command);
      if (!BACKGROUNDS.includes(name as Background)) {
        errorMessage(
          `Unknown background "${name}". Known backgrounds: ${BACKGROUNDS.join(', ')}.`
        );
        process.exitCode = 1;
        return;
      }
      setActiveBackground(name as Background);
      activatePersistedTheme();
      successMessage(`Background set to "${name}".`);
    });

  return program;
}
