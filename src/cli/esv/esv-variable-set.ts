import { frodo } from '@rockcarver/frodo-lib';

import { getTokens } from '../../ops/AuthenticateOps';
import { updateVariable } from '../../ops/cloud/VariablesOps';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv variable set',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Set variable description.')
    .requiredOption('-i, --variable-id <variable-id>', 'Variable id.')
    .option('--value [value]', 'Variable value.')
    .option('--description [description]', 'Variable description.')
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

        if (!options.value && !options.description) {
          printMessage(
            'Provide --variable-id and either one or both of --value and --description.'
          );
          process.exitCode = 1;
          program.help();
        }

        const getTokensIsSuccessful = await getTokens(
          false,
          true,
          deploymentTypes
        );
        if (!getTokensIsSuccessful) process.exit(1);
        verboseMessage('Updating variable...');
        const outcome = await updateVariable(
          options.variableId,
          options.value,
          options.description
        );
        if (!outcome) process.exitCode = 1;
      }
      // end command logic inside action handler
    );

  return program;
}
