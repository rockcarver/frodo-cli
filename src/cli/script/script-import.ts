import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  importScriptsFromFile,
  importScriptsFromFiles,
} from '../../ops/ScriptOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo script import');

  program
    .description('Import scripts.')
    .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
    .addOption(
      new Option(
        '-i, --script-id <uuid>',
        'Uuid of the script. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-n, --script-name <name>',
        'Name of the script. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '--re-uuid',
        'Re-UUID. Create a new UUID for the script upon import. Use this to duplicate a script or create a new version of the same script. Note that you must also choose a new name using -n/--script-name to avoid import errors.'
      ).default(false, 'false')
    )
    // deprecated option
    .addOption(
      new Option(
        '-s, --script <script>',
        'DEPRECATED! Use -n/--script-name instead. Name of the script.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all scripts from separate files (*.script.json) in the current directory. Ignored with -n.'
      )
    )
    .addOption(
      new Option(
        '-w, --watch',
        'Watch for changes to the script files and import the scripts automatically when the file changes. Can only be used with -A.'
      ).default(false, 'false')
    )
    .addOption(
      new Option(
        '-d, --default',
        'Import all scripts including the default scripts.'
      )
    )
    .addOption(
      new Option(
        '--no-deps',
        'Do not include script dependencies (i.e. library scripts). Can only be used with -n or -i.'
      )
    )
    .action(
      // implement command logic inside action handler
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );

        if (options.file && (await getTokens())) {
          verboseMessage(
            `Importing script(s) into realm "${state.getRealm()}"...`
          );
          const outcome = await importScriptsFromFile(
            options.scriptId,
            options.scriptName || options.script,
            options.file,
            {
              deps: options.deps,
              reUuid: options.reUuid,
              includeDefault: options.default,
            }
          );
          if (!outcome) process.exitCode = 1;
        } else if (options.allSeparate && (await getTokens())) {
          verboseMessage(
            `Importing all script files into realm "${state.getRealm()}"...`
          );
          try {
            await importScriptsFromFiles(
              options.watch,
              {
                deps: options.deps,
                reUuid: options.reUuid,
                includeDefault: options.default,
              },
              true
            );
          } catch (error) {
            process.exitCode = 1;
          }
        }

        // unrecognized combination of options or no options
        else {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
          program.help();
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
