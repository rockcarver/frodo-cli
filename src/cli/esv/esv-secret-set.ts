import { frodo } from '@rockcarver/frodo-lib';
import { getTokens } from '../../ops/AuthenticateOps';
import { setSecretDescription } from '../../ops/cloud/SecretsOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv secret set',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Set secret description.')
    .requiredOption('-i, --secret-id <secret-id>', 'Secret id.')
    .requiredOption('--description <description>', 'Secret description.')
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
        // An unspecified mandatory secretId is asked for by the framework
        // once the login worked (a secret picker, record 0038).
        if (await getTokens(false, true, deploymentTypes)) {
          verboseMessage('Setting secret description...');
          const outcome = await setSecretDescription(
            options.secretId,
            options.description
          );
          if (!outcome) process.exitCode = 1;
        }
        // The only way no branch runs is getTokens() failing, which includes
        // the user declining the picker.
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
