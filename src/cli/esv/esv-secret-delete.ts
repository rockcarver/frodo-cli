import { frodo, type SecretSkeleton } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteSecret, deleteSecrets } from '../../ops/cloud/SecretsOps';
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
    .requireOneOf({ options: ['secretId', 'all'], purpose: 'which secrets' })
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
        // --all -a, or an interactive pick of the secret to delete
        // (resolveEntityPicks is a no-op outside the prompt gate, so a
        // non-interactive run with neither option never reaches
        // deleteSecrets here -- same as before Phase 3, where the error
        // branch below handled that case).
        else if (
          (options.all || (await resolveEntityPicks(command))) &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          if (options.secretId) {
            verboseMessage(`Deleting secret ${options.secretId}...`);
            const outcome = await deleteSecret(options.secretId);
            if (!outcome) process.exitCode = 1;
          } else {
            verboseMessage('Deleting all secrets...');
            const outcome = await deleteSecrets();
            if (!outcome) process.exitCode = 1;
          }
        }
        // No branch ran: with requireOneOf satisfied, the only ways here
        // are getTokens() failing (keep the old exit-1 semantics -- the
        // removed else handled auth failure too) or the user escaping the
        // entity picker (declined to run).
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
