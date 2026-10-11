import { frodo, type SecretSkeleton } from '@rockcarver/frodo-lib';
import { getTokens } from '../../ops/AuthenticateOps';
import { setSecretDescription } from '../../ops/cloud/SecretsOps';
import { verboseMessage } from '../../utils/Console.js';
import {
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
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
        // An unspecified mandatory secretId prompts for a secret from the
        // live system (no-op outside the prompt gate) before getTokens.
        if (
          (options.secretId ||
            (await resolveEntityPicks(command, [
              entityPick<SecretSkeleton>({
                name: 'secretId',
                kind: 'secret',
                load: frodo.cloud.secret.readSecrets,
                label: (secret) => secret._id ?? '',
                description: (secret) => secret.description,
              }),
            ]))) &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Setting secret description...');
          const outcome = await setSecretDescription(
            options.secretId,
            options.description
          );
          if (!outcome) process.exitCode = 1;
        }
        // The only ways no branch runs are getTokens() failing or the user
        // escaping the entity picker.
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
