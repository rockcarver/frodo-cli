import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { describeSecretStore } from '../../ops/SecretStoreOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { DEPLOYMENT_TYPES, CLASSIC_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = DEPLOYMENT_TYPES;
const globalDeploymentTypes = [CLASSIC_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo secretstore describe',
    [],
    deploymentTypes
  );

  program
    .description('Describe secret stores.')
    .addOption(
      new Option('-i, --secretstore-id <secretstore-id>', 'Secret store id.')
    )
    .addOption(
      new Option(
        '-t, --secretstore-type <secretstore-type>',
        'Secret store type id of the secret store. Only necessary if there are multiple secret stores with the same secret store id. Ignored if -i is not specified.'
      )
    )
    .addOption(
      new Option(
        '-g, --global',
        'Describe global secret stores. For classic deployments only.'
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
          options.secretstoreId &&
          (await getTokens(
            false,
            true,
            options.global ? globalDeploymentTypes : deploymentTypes
          ))
        ) {
          verboseMessage(`Describing secret store ${options.secretstoreId}`);
          const outcome = await describeSecretStore(
            options.secretstoreId,
            options.secretstoreType,
            options.global
          );
          if (!outcome) process.exitCode = 1;
        } else {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
          program.outputHelp();
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );
  return program;
}
