import { Option } from 'commander';
import {
  errorMessage,
  printMessage,
  successMessage,
} from '../../utils/Console';
import { readSettings, setGuidedMode } from '../../utils/SettingsStore';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo settings guided',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description(
      'Show or set guided mode: run the optional-options invocation editor (the --edit flow) by default on every interactive command.'
    )
    .addOption(
      new Option(
        '--on',
        'Enable guided mode (same as passing --edit on every command).'
      ).default(false)
    )
    .addOption(
      new Option(
        '--off',
        'Disable guided mode; --edit stays available per-invocation.'
      ).default(false)
    )
    .action(async (options, command) => {
      command.handleDefaultArgsAndOpts(options, command);
      try {
        if (options.on && options.off) {
          errorMessage('Pass either --on or --off, not both.');
          process.exitCode = 1;
          return;
        }
        if (options.on) {
          setGuidedMode(true);
          successMessage('Guided mode enabled.');
        } else if (options.off) {
          setGuidedMode(false);
          successMessage('Guided mode disabled.');
        }
        const state = readSettings().guidedMode ? 'enabled' : 'disabled';
        printMessage(
          `Guided mode is ${state}. ${
            state === 'enabled'
              ? 'Every interactive command opens the optional-options editor; pass --no-prompt to skip all prompting.'
              : 'Pass --edit on a command to edit its optional options for that invocation.'
          }`
        );
      } catch (error) {
        errorMessage(`${error}`);
        process.exitCode = 1;
      }
    });

  return program;
}
