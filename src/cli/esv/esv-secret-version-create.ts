import { frodo, type SecretSkeleton } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  createVersionOfSecret,
  createVersionOfSecretFromFile,
} from '../../ops/cloud/SecretsOps';
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
    'frodo esv secret version create',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Create new version of secret.')
    .addOption(new Option('-i, --secret-id <secret-id>', 'Secret id.'))
    .addOption(new Option('--value <value>', 'Secret value.'))
    .addOption(
      new Option(
        '-f, --file [file]',
        'Name of the file to read pem or base64hmac encoded secret from. Ignored if --value is specified'
      )
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
        // An unspecified secretId prompts for a secret from the live
        // system (no-op outside the prompt gate) before getTokens.
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
          verboseMessage('Creating new version of secret...');
          let outcome;
          if (options.value) {
            outcome = await createVersionOfSecret(
              options.secretId,
              options.value
            );
          } else {
            outcome = await createVersionOfSecretFromFile(
              options.secretId,
              options.file
            );
          }
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
