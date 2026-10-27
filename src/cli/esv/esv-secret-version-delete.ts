import { frodo, type SecretSkeleton } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteVersionOfSecret } from '../../ops/cloud/SecretsOps';
import { verboseMessage } from '../../utils/Console.js';
import {
  deferEntityPicks,
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
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
    .addOption(
      new Option(
        '-i, --secret-id <secret-id>',
        'Secret id. Cannot be used with -a.'
      ).conflicts(['all'])
    )
    .addOption(new Option('-v, --version <version>', 'Version of secret.'))
    .addOption(
      new Option(
        '-a, --all',
        'Delete all secrets in a realm. Cannot be used with -i.'
      ).conflicts(['secretId'])
    )
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
        // An unspecified secretId (version is still asked for by the
        // requireAllOf resolver) prompts for a secret from the live system
        // (no-op outside the prompt gate) before getTokens.
        if (
          (options.secretId || (await resolveEntityPicks(command))) &&
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
        // --all -a
        // else if (options.all && (await getTokens(false, true, deploymentTypes))) {
        //   printMessage('Deleting all versions...');
        //   const outcome = deleteJourneys(options);
        //   if (!outcome) process.exitCode = 1;
        // }
        // No branch ran: with requireAllOf satisfied, the only ways here
        // are getTokens() failing or the user escaping the entity picker --
        // keep the old exit-1 semantics.
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  deferEntityPicks(program, [
    entityPick<SecretSkeleton>({
      name: 'secretId',
      kind: 'secret',
      load: frodo.cloud.secret.readSecrets,
      label: (secret) => secret._id ?? '',
      description: (secret) => secret.description,
    }),
  ]);

  return program;
}
