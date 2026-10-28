import { frodo, type SecretSkeleton } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  pruneVersionsOfSecret,
  pruneVersionsOfSecrets,
} from '../../ops/cloud/SecretsOps';
import c from '../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import {
  deferEntityPicks,
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

/** What a prune invocation acts on. */
export type PruneTarget =
  | { kind: 'secret'; secretId: string }
  | { kind: 'all' }
  | { kind: 'none'; reason: 'nothing-selected' | 'ambiguous' };

/**
 * Decides what to prune from the parsed options. Pruning is destructive and
 * `--all` reaches every secret, so everything is pruned only when `--all`
 * was given and no secret id was. Neither option (a declined, failed or empty
 * pick) and both options (the conflict is checked while parsing, but a
 * prompted or saved value could still arrive beside `--all`) prune nothing.
 * @param options parsed command options
 * @returns the target, or `none` with the reason
 */
export function pruneTarget(options: {
  secretId?: string;
  all?: boolean;
}): PruneTarget {
  if (options.all && options.secretId) {
    return { kind: 'none', reason: 'ambiguous' };
  }
  if (options.all) return { kind: 'all' };
  if (options.secretId) return { kind: 'secret', secretId: options.secretId };
  return { kind: 'none', reason: 'nothing-selected' };
}

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv secret version prune',
    ['realm'],
    deploymentTypes
  );

  program
    .description(
      'Prune versions of secrets. Deletes every version of a secret except the active version.'
    )
    .addOption(
      new Option(
        '-i, --secret-id <secret-id>',
        'Secret id. Cannot be used with -a.'
      ).conflicts(['all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Prune all secrets. Cannot be used with -i.'
      ).conflicts(['secretId'])
    )
    .addOption(
      new Option(
        '--keep-loaded',
        'Keep the versions that are currently loaded, whether they are active or not.'
      )
    )
    .addOption(
      new Option(
        '--keep-deactivated',
        'Keep the deactivated versions. Only the activated versions other than the active version are pruned.'
      )
    )
    .requireOneOf({
      options: ['secretId', 'all'],
      purpose: 'which secrets to prune',
    })
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Prune the old versions of a secret, keeping only its active version:\n` +
        c.command(
          `  $ frodo esv secret version prune -i esv-nebuchadnezzar-key ${s.connId}\n`
        ) +
        `  Prune the old versions of a secret and log in with AM base URL, username, and password:\n` +
        c.command(
          `  $ frodo esv secret version prune -i esv-nebuchadnezzar-key ${s.amBaseUrl} ${s.username} '${s.password}'\n`
        ) +
        `  Prune a secret but keep the versions that are currently loaded:\n` +
        c.command(
          `  $ frodo esv secret version prune -i esv-nebuchadnezzar-key --keep-loaded ${s.connId}\n`
        ) +
        `  Prune a secret but keep its deactivated versions:\n` +
        c.command(
          `  $ frodo esv secret version prune -i esv-nebuchadnezzar-key --keep-deactivated ${s.connId}\n`
        ) +
        `  Prune the old versions of all secrets:\n` +
        c.command(`  $ frodo esv secret version prune -a ${s.connId}\n`)
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
        // With neither -i nor -a a terminal session picks a secret (a no-op
        // outside the prompt gate). A declined or failed pick ends the
        // command: nothing here ever falls through to pruning all secrets.
        if (
          !options.secretId &&
          !options.all &&
          !(await resolveEntityPicks(command))
        ) {
          process.exitCode = 1;
          return;
        }
        const target = pruneTarget(options);
        if (target.kind === 'none') {
          printMessage(
            target.reason === 'ambiguous'
              ? 'Cannot prune with both a secret id and --all; nothing was pruned.'
              : 'No secret was selected; nothing was pruned.',
            'error'
          );
          process.exitCode = 1;
          return;
        }
        if (!(await getTokens(false, true, deploymentTypes))) {
          process.exitCode = 1;
          return;
        }
        let outcome: boolean;
        if (target.kind === 'all') {
          verboseMessage('Pruning the versions of all secrets...');
          outcome = await pruneVersionsOfSecrets(
            options.keepLoaded,
            options.keepDeactivated
          );
        } else {
          verboseMessage(
            `Pruning the versions of secret ${target.secretId}...`
          );
          outcome = await pruneVersionsOfSecret(
            target.secretId,
            options.keepLoaded,
            options.keepDeactivated
          );
        }
        if (!outcome) process.exitCode = 1;
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
