import confirm from '@inquirer/confirm';
import { frodo, type SecretSkeleton } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  findVersionsToPruneOfAllSecrets,
  findVersionsToPruneOfSecret,
  printPrunePlan,
  pruneVersionsOfPlan,
  pruneVersionsOfSecret,
  summarizePrunePlan,
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

/** What to do with a prune plan once it has been shown. */
export type PruneGate = 'dry-run' | 'proceed' | 'ask' | 'refuse';

/**
 * Decides whether a plan may be carried out. A dry run never deletes, even with
 * `--yes`. Otherwise `--yes` proceeds, a terminal is asked, and anything else
 * is refused: nothing is ever deleted without either a yes on the command line
 * or an answer from a person.
 * @param options the parsed `--yes` and `--dry-run` options and whether stdin is a terminal
 * @returns the gate
 */
export function pruneGate(options: {
  yes?: boolean;
  dryRun?: boolean;
  interactive: boolean;
}): PruneGate {
  if (options.dryRun) return 'dry-run';
  if (options.yes) return 'proceed';
  return options.interactive ? 'ask' : 'refuse';
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
        'Prune all secrets. Shows which versions will be deleted and asks for confirmation (see -y and --dry-run). Cannot be used with -i.'
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
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before pruning all secrets. Required with -a when there is no terminal. Has no effect with -i, which never asks.'
      )
    )
    .addOption(
      new Option(
        '--dry-run',
        'Dry-run only, do not delete anything: show which versions would be pruned. Works with -i and -a, and wins over -y.'
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
        `  Show which versions pruning all secrets would delete, without deleting anything:\n` +
        c.command(
          `  $ frodo esv secret version prune -a --dry-run ${s.connId}\n`
        ) +
        `  Prune the old versions of all secrets. Shows the versions to delete and asks for confirmation; add -y to skip the question, which is required without a terminal:\n` +
        c.command(`  $ frodo esv secret version prune -a -y ${s.connId}\n`)
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
        const interactive = !!process.stdin.isTTY;
        // Fail before reading the tenant when the run could never be allowed
        // to delete: all secrets, no --yes, and nobody to ask.
        if (
          target.kind === 'all' &&
          pruneGate({
            yes: options.yes,
            dryRun: options.dryRun,
            interactive,
          }) === 'refuse'
        ) {
          printMessage(
            'Refusing to prune all secrets without confirmation: there is no interactive terminal to ask. Pass -y/--yes to prune without asking, or --dry-run to only show what would be deleted.',
            'error'
          );
          process.exitCode = 1;
          return;
        }
        if (!(await getTokens(false, true, deploymentTypes))) {
          process.exitCode = 1;
          return;
        }
        // One named secret is pruned directly, as before. Everything else
        // (all secrets, or any dry run) first finds, and shows, what would go.
        if (target.kind === 'secret' && !options.dryRun) {
          verboseMessage(
            `Pruning the versions of secret ${target.secretId}...`
          );
          if (
            !(await pruneVersionsOfSecret(
              target.secretId,
              options.keepLoaded,
              options.keepDeactivated
            ))
          ) {
            process.exitCode = 1;
          }
          return;
        }
        verboseMessage(
          target.kind === 'all'
            ? 'Finding the versions of all secrets to prune...'
            : `Finding the versions of secret ${target.secretId} to prune...`
        );
        const plan =
          target.kind === 'all'
            ? await findVersionsToPruneOfAllSecrets(
                options.keepLoaded,
                options.keepDeactivated
              )
            : await findVersionsToPruneOfSecret(
                target.secretId,
                options.keepLoaded,
                options.keepDeactivated
              );
        if (!plan) {
          process.exitCode = 1;
          return;
        }
        printPrunePlan(plan, options.keepLoaded, options.keepDeactivated);
        const { affected, versions } = summarizePrunePlan(plan);
        if (versions === 0) return;
        const gate = pruneGate({
          yes: options.yes,
          dryRun: options.dryRun,
          interactive,
        });
        if (gate === 'dry-run') {
          printMessage('\nDry run: nothing was deleted.', 'info');
          return;
        }
        if (
          gate === 'ask' &&
          !(await confirm({
            message: `\nPermanently delete ${versions} ${versions === 1 ? 'version' : 'versions'} from ${affected} ${affected === 1 ? 'secret' : 'secrets'}?`,
            default: false,
          }))
        ) {
          printMessage('Nothing was deleted.', 'info');
          return;
        }
        if (
          !(await pruneVersionsOfPlan(
            plan,
            options.keepLoaded,
            options.keepDeactivated
          ))
        ) {
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
