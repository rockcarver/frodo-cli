import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportVariablesToFile,
  exportVariablesToFiles,
  exportVariableToFile,
} from '../../ops/cloud/VariablesOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv variable export',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Export variables.')
    .addOption(
      new Option(
        '-i, --variable-id <variable-id>',
        'Variable id. If specified, -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
    .addOption(
      new Option(
        '-a, --all',
        'Export all variables to a single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all variables to separate files (*.variable.json) in the current directory. Ignored with -i or -a.'
      )
    )
    .addOption(
      new Option(
        '--no-decode',
        'Do not include decoded variable value in export'
      ).default(false, 'false')
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
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
        if (
          options.variableId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Exporting variable "${
              options.variableId
            }" from realm "${state.getRealm()}"...`
          );
          const outcome = await exportVariableToFile(
            options.variableId,
            options.file,
            options.decode,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
        } else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all variables to a single file...');
          const outcome = await exportVariablesToFile(
            options.file,
            options.decode,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
        } else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all variables to separate files...');
          const outcome = await exportVariablesToFiles(
            options.decode,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
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

  return program;
}
