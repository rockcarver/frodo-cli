import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  importVariableFromFile,
  importVariablesFromFile,
  importVariablesFromFiles,
} from '../../ops/cloud/VariablesOps';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv variable import',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Import variables.')
    .addOption(
      new Option(
        '-i, --variable-id <variable-id>',
        'Variable id. If specified, only one variable is imported and the options -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
    .addOption(
      new Option(
        '-a, --all',
        'Import all variables from single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all variables from separate files (*.variable.json) in the current directory. Ignored with -i or -a.'
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
        // import
        if (
          options.variableId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          printMessage(`Importing variable ${options.variableId}...`);
          const outcome = await importVariableFromFile(
            options.variableId,
            options.file
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          printMessage(
            `Importing all variables from a single file (${options.file})...`
          );
          const outcome = await importVariablesFromFile(options.file);
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          !options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          printMessage(
            'Importing all variables from separate files in working directory...'
          );
          const outcome = await importVariablesFromFiles();
          if (!outcome) process.exitCode = 1;
        }
        // import first
        else if (
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          printMessage('Importing first variable in file...');
          const outcome = await importVariableFromFile(null, options.file);
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
