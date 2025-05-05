import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { describeVariable } from '../../ops/cloud/VariablesOps';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv variable describe',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Describe variables.')
    .addOption(
      new Option(
        '-i, --variable-id <variable-id>',
        'Variable id.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '-f, --file [file]',
        'Optional export file to use to determine usage. Overrides -D, --directory. Only used if -u or --usage is provided as well.'
      )
    )
    .addOption(
      new Option(
        '-u, --usage',
        'List all uses of the variable. If a file is provided with -f or --file, it will search for usage in the file. If a directory is provided with -D or --directory, it will search for usage in all .json files in the directory and sub-directories. If no file or directory is provided, it will perform a full export automatically to determine usage.'
      ).default(false, 'false')
    )
    .addOption(new Option('--json', 'Output in JSON format.'))
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
          verboseMessage(`Describing variable ${options.variableId}...`);
          const outcome = await describeVariable(
            options.variableId,
            options.file,
            options.usage,
            options.json
          );
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
