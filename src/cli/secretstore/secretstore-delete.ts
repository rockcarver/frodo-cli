import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteSecretStore,
  deleteSecretStores,
} from '../../ops/SecretStoreOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLASSIC_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLASSIC_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo secretstore delete',
    [],
    deploymentTypes
  );

  program
    .description('Delete secret stores.')
    .addOption(
      new Option(
        '-i, --secretstore-id <secretstore-id>',
        'Secret store id. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-t, --secretstore-type <secretstore-type>',
        'Secret store type id of the secret store. Only necessary if there are multiple secret stores with the same secret store id. Ignored if -i is not specified.'
      )
    )
    .addOption(new Option('-g, --global', 'Delete global secret stores.'))
    .addOption(
      new Option('-a, --all', 'Delete all secret stores. Ignored with -i.')
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
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(`Deleting secret store ${options.secretstoreId}...`);
          const outcome = await deleteSecretStore(
            options.secretstoreId,
            options.secretstoreType,
            options.global
          );
          if (!outcome) process.exitCode = 1;
        } else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Deleting all${options.global ? ' global' : ''} secret stores...`
          );
          const outcome = await deleteSecretStores(options.global);
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
