import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { deleteSecret, deleteSecrets } from '../../ops/cloud/SecretsOps';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv secret delete',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Delete secrets.')
    .addOption(
      new Option(
        '-i, --secret-id <secret-id>',
        'Secret id. If specified, -a is ignored.'
      )
    )
    .addOption(
      new Option('-a, --all', 'Delete all secrets in a realm. Ignored with -i.')
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
        // delete by id
        if (
          options.secretId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Deleting secret...');
          const outcome = await deleteSecret(options.secretId);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Deleting all secrets...');
          const outcome = await deleteSecrets();
          if (!outcome) process.exitCode = 1;
        }
        // unrecognized combination of options or no options
        else {
          printMessage('Unrecognized combination of options or no options...');
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
