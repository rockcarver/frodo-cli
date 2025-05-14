import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteAllScripts,
  deleteScriptId,
  deleteScriptName,
} from '../../ops/ScriptOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo script delete', [], deploymentTypes);

  program
    .description('Delete scripts.')
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
        if (
          options.scriptId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Deleting script ${
              options.scriptId
            } in realm "${state.getRealm()}"...`
          );
          const outcome = await deleteScriptId(options.scriptId);
          if (!outcome) process.exitCode = 1;
        } else if (
          options.scriptName &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Deleting script ${
              options.scriptName
            } in realm "${state.getRealm()}"...`
          );
          const outcome = await deleteScriptName(options.scriptName);
          if (!outcome) process.exitCode = 1;
        } else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Deleting all non-default scripts...');
          const outcome = await deleteAllScripts();
          if (!outcome) process.exitCode = 1;
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
