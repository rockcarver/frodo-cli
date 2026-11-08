import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { describeSecretStore } from '../../ops/SecretStoreOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const {
  DEPLOYMENT_TYPES,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = DEPLOYMENT_TYPES;
const globalDeploymentTypes = [
  CLASSIC_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

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
        'Secret store type id of the secret store. Only necessary if there are multiple secret stores with the same secret store id.'
      )
    )
    .addOption(
      new Option(
        '-g, --global',
        'Describe global secret stores. For classic deployments only.'
      )
    )
    .requireOneOf({ options: ['secretstoreId'], purpose: 'which secret store' })
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
        // The login comes first: a secret store that was not given is asked
        // for by the framework once it worked (a secret store picker, record
        // 0038), and a declined pick makes getTokens fail.
        if (
          await getTokens(
            false,
            true,
            options.global ? globalDeploymentTypes : deploymentTypes
          )
        ) {
          if (options.secretstoreId) {
            verboseMessage(`Describing secret store ${options.secretstoreId}`);
            const outcome = await describeSecretStore(
              options.secretstoreId,
              options.secretstoreType,
              options.global
            );
            if (!outcome) process.exitCode = 1;
          } else {
            // the picker had no secret store to offer
            printMessage('There is no secret store to choose from.', 'error');
            process.exitCode = 1;
          }
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );
  return program;
}
