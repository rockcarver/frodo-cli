import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  deleteAllScripts,
  deleteScriptId,
  deleteScriptName,
} from '../../ops/ScriptOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo script delete');

program
  .description('Delete scripts.')
  .addOption(
    new Option(
      '-i, --script-id <script>',
      'id of a script. If specified, -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '-n, --script-name <script>',
      'name of a script. If specified, -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Delete all non-default scripts in a realm. Ignored with -i.'
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
      if (options.scriptId && (await getTokens())) {
        verboseMessage(
          `Deleting script ${
            options.scriptId
          } in realm "${state.getRealm()}"...`
        );
        deleteScriptId(options.scriptId);
      } else if (options.scriptName && (await getTokens())) {
        verboseMessage(
          `Deleting script ${
            options.scriptName
          } in realm "${state.getRealm()}"...`
        );
        deleteScriptName(options.scriptName);
      } else if (options.all && (await getTokens())) {
        verboseMessage('Deleting all non-default scripts...');
        deleteAllScripts();
      } else {
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

program.parse();
