import { Option } from 'commander';
import {
  errorMessage,
  printMessage,
  successMessage,
} from '../../utils/Console';
import {
  clearDefaultsByPath,
  readDefaultsStore,
} from '../../utils/interactive/DefaultsStore';
import { FrodoCommand } from '../FrodoCommand';

/**
 * The per-command defaults surface (docs/INTERACTIVE-COMMANDS.md): show or clear the
 * persistent per-command defaults saved via `--prompt --save-defaults`.
 * Local command -- no connection, no auth; the store is a plain JSON
 * file under ~/.frodo.
 */
export default function setup() {
  const program = new FrodoCommand(
    'frodo settings defaults',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description(
      "Show or clear per-command defaults saved with --prompt --save-defaults (~/.frodo/Defaults.json). Values apply to future runs whenever the option isn't given explicitly."
    )
    .addOption(
      new Option(
        '--clear <command-path>',
        'Clear the saved defaults of one command, e.g. "journey list".'
      )
    )
    .action(async (options, command) => {
      command.handleDefaultArgsAndOpts(options, command);
      try {
        if (options.clear) {
          const target = String(options.clear).trim();
          if (!readDefaultsStore()[target]) {
            errorMessage(`No saved defaults for '${target}'.`);
            process.exitCode = 1;
            return;
          }
          // Clearing by verbatim path must work even when the command's
          // option set changed since the save -- hence the path-keyed
          // primitive, not the Command-object one.
          clearDefaultsByPath(target);
          successMessage(`Cleared saved defaults for '${target}'.`);
          return;
        }
        const store = readDefaultsStore();
        const paths = Object.keys(store).sort();
        if (paths.length === 0) {
          printMessage(
            'No saved defaults. Run any command with --prompt --save-defaults and commit options in the editor to save them.'
          );
          return;
        }
        for (const storePath of paths) {
          printMessage(`${storePath}:`);
          for (const [name, value] of Object.entries(store[storePath])) {
            printMessage(`  ${name} = ${JSON.stringify(value)}`);
          }
        }
      } catch (error) {
        errorMessage(`${error}`);
        process.exitCode = 1;
      }
    });

  return program;
}
