import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteVersionOfSecret } from '../../ops/cloud/SecretsOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv secret version delete',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Delete versions of secrets.')
    .addOption(new Option('-i, --secret-id <secret-id>', 'Secret id.'))
    .addOption(new Option('-v, --version <version>', 'Version of secret.'))
    .requireAllOf({
      options: ['secretId', 'version'],
      purpose: 'which secret version',
    })
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
        // An unspecified secretId is asked for by the framework once the
        // login worked (a secret picker, record 0038); the version is still
        // asked for by the requireAllOf resolver.
        if (
          options.version &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(`Deleting version of secret...`);
          const outcome = await deleteVersionOfSecret(
            options.secretId,
            options.version
          );
          if (!outcome) process.exitCode = 1;
        }
        // No branch ran: with requireAllOf satisfied, the only way here is
        // getTokens() failing, which includes the user declining the picker --
        // keep the old exit-1 semantics.
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
