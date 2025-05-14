import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteVariableById,
  deleteVariables,
} from '../../ops/cloud/VariablesOps';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv variable delete',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Delete variables.')
    .addOption(
      new Option(
        '-i, --variable-id <variable-id>',
        'Variable id. If specified, -a is ignored.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all variable in a realm. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '--no-deep',
        'No deep delete. This leaves orphaned configuration artifacts behind.'
      )
    )
    .action(
      // implement command logic inside action handler
      async (host, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          user,
          password,
          options,
          command
        );
        // delete by id
        if (
          options.variableId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Deleting variable...');
          const outcome = await deleteVariableById(options.variableId);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Deleting all variables...');
          const outcome = await deleteVariables();
          if (!outcome) process.exitCode = 1;
        }
        // unrecognized combination of options or no options
        else {
          printMessage('Unrecognized combination of options or no options...');
          program.help();
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
