import { errorMessage, successMessage } from '../../utils/Console';
import {
  isAutoDetectEnabled,
  setAutoDetectEnabled,
} from '../../utils/ThemeConfig';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo settings theme autodetect',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description(
      'Enable or disable one-time terminal-background auto-detection on first run. Run with no argument to show the current setting.'
    )
    .argument('[state]', 'Either "on" or "off".')
    .action(async (state, options, command) => {
      command.handleDefaultArgsAndOpts(state, options, command);
      if (state === undefined) {
        successMessage(
          `Auto-detection is currently ${isAutoDetectEnabled() ? 'on' : 'off'}.`
        );
        return;
      }
      if (state !== 'on' && state !== 'off') {
        errorMessage(`Invalid value "${state}". Use "on" or "off".`);
        process.exitCode = 1;
        return;
      }
      setAutoDetectEnabled(state === 'on');
      successMessage(`Auto-detection is now ${state}.`);
    });

  return program;
}
