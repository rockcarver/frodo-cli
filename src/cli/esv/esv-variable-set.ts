import { frodo } from '@rockcarver/frodo-lib';
import { getTokens } from '../../ops/AuthenticateOps';
import { updateVariable } from '../../ops/cloud/VariablesOps';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import {
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
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
        // An unspecified mandatory variableId prompts for a variable from
        // the live system (no-op outside the prompt gate) now that tokens
        // are available.
        if (
          !options.variableId &&
          !(await resolveEntityPicks(command, [
            entityPick<
              Awaited<
                ReturnType<typeof frodo.cloud.variable.readVariables>
              >[number]
            >({
              name: 'variableId',
              kind: 'variable',
              load: () => frodo.cloud.variable.readVariables(),
              label: (variable) => variable._id ?? '',
              description: (variable) => variable.description,
            }),
          ]))
        ) {
          // User escaped the entity picker -- declined to run.
          process.exitCode = 1;
          return;
        }
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
