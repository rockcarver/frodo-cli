import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { createSecretStoreMapping } from '../../ops/SecretStoreOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { DEPLOYMENT_TYPES, CLASSIC_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = DEPLOYMENT_TYPES;
const globalDeploymentTypes = [CLASSIC_DEPLOYMENT_TYPE_KEY];

const { canSecretStoreHaveMappings } = frodo.secretStore;

export default function setup() {
  const program = new FrodoCommand(
    'frodo secretstore mapping create',
    [],
    deploymentTypes
  );

  program
    .description('Create secret store mappings.')
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
      new Option(
        '-s, --secret-id <secret-id>',
        'Secret label of the mapping being created.'
      )
    )
    .addOption(
      new Option(
        '-a, --aliases <aliases>',
        'Comma separated list of aliases to add. The first one will be the active one.'
      )
    )
    .addOption(
      new Option(
        '-g, --global',
        'Create mappings in global secret stores. For classic deployments only.'
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
          options.aliases &&
          (await getTokens(
            false,
            true,
            options.global ? globalDeploymentTypes : deploymentTypes
          ))
        ) {
          verboseMessage(
            `Creating the mapping ${options.secretId} in the secret store ${options.secretstoreId}'`
          );
          const outcome = await createSecretStoreMapping(
            options.secretstoreId,
            options.secretstoreType,
            options.secretId,
            options.aliases,
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
