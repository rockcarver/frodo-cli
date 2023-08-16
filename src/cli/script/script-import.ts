import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  importScriptsFromFile,
  importScriptsFromFiles,
} from '../../ops/ScriptOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo script import');

program
  .description('Import scripts.')
  .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
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
      const tokens = await getTokens();
      if (!tokens) {
        printMessage('Unable to get tokens. Exiting...', 'error');
        program.help();
        process.exitCode = 1;
        return;
      }

      verboseMessage(`Importing script(s) into realm "${state.getRealm()}"...`);

      if (options.scriptName) {
        const outcome = await importScriptsFromFile(
          options.scriptName || options.script,
          options.file,
          options.reUuid
        );
        if (!outcome) process.exitCode = 1;
      } else if (options.allSeparate) {
        await importScriptsFromFiles(options.watch, options.reUuid, true);
      }
    }
    // end command logic inside action handler
  );

program.parse();
