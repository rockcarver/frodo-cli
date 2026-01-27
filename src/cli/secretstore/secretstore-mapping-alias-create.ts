import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { createSecretStoreMappingAlias } from '../../ops/SecretStoreOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { DEPLOYMENT_TYPES, CLASSIC_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = DEPLOYMENT_TYPES;
const globalDeploymentTypes = [CLASSIC_DEPLOYMENT_TYPE_KEY];

const { canSecretStoreHaveMappings } = frodo.secretStore;

export default function setup() {
  const program = new FrodoCommand(
    'frodo secretstore mapping alias create',
    [],
    deploymentTypes
  );

  program
    .description('Create secret store mapping alias.')
    .addOption(
      new Option(
        '-i, --secretstore-id <secretstore-id>',
        'Secret store id of the secret store where the mapping belongs.'
      )
    )
    .addOption(
      new Option(
        '-t, --secretstore-type <secretstore-type>',
        'Secret store type id. Only necessary if there are multiple secret stores with the same secret store id.'
      )
    )
    .addOption(
      new Option('-s, --secret-id <secret-id>', 'Secret label of the mapping.')
    )
    .addOption(new Option('-a, --alias <alias>', 'The alias to create.'))
    .addOption(
      new Option(
        '--activate',
        'If provided, it will activate the alias when it is added. If not provided, it will default to adding the alias to the end of the alias list.'
      )
    )
    .addOption(
      new Option(
        '-g, --global',
        'Create aliases for global secret stores. For classic deployments only.'
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
          options.secretstoreType &&
          !canSecretStoreHaveMappings(options.secretstoreType)
        ) {
          printMessage(
            `'${options.secretstoreType}' does not have mappings.`,
            'error'
          );
          process.exitCode = 1;
        } else if (
          options.secretstoreId &&
          options.secretId &&
          options.alias &&
          (await getTokens(
            false,
            true,
            options.global ? globalDeploymentTypes : deploymentTypes
          ))
        ) {
          verboseMessage(
            `Creating the mapping alias ${options.alias} in the mapping ${options.secretId} in the secret store ${options.secretstoreId}'`
          );
          const outcome = await createSecretStoreMappingAlias(
            options.secretstoreId,
            options.secretstoreType,
            options.secretId,
            options.alias,
            options.activate,
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
