import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import {
  configManagerDeleteSecrets,
  showSecretDeletePlan,
} from '../../../configManagerOps/FrConfigSecretOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete secrets',
    [],
    deploymentTypes
  );

  program
    .description('Delete secrets.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Secret name, which is its id (for example esv-example) and is matched exactly; delete only the specified secret. If omitted, all secrets are deleted.'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which secrets would be deleted without deleting them.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting more than one secret (no -n). Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete a secret by name, which is its id:\n` +
        c.command(
          `  $ frodo config-manager delete secrets -n esv-example ${s.connId}\n`
        ) +
        `  Preview deletion of a secret by name:\n` +
        c.command(
          `  $ frodo config-manager delete secrets -n esv-example -d ${s.connId}\n`
        ) +
        `  Preview the deletion of all secrets:\n` +
        c.command(`  $ frodo config-manager delete secrets -d ${s.connId}\n`) +
        `  Delete all secrets without asking, which is required without a terminal (without -y a terminal is asked first). The values of a deleted secret cannot be recovered:\n` +
        c.command(`  $ frodo config-manager delete secrets -y ${s.connId}\n`)
    )
    .multiOp()
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      // an empty name must never mean "all": "not given" and "given but empty"
      // are different (-n "$UNSET" gives an empty name)
      const named = options.name !== undefined;
      if (named && options.name.trim() === '') {
        printMessage(
          'The secret name (-n) must not be empty. To delete all secrets, leave out -n.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      // a run that nobody can be asked about is refused before the login
      // (cli record 0037)
      const what = 'all secrets';
      if (
        !named &&
        !checkBulkDelete({ what, yes: options.yes, dryRun: options.dryRun })
      ) {
        process.exitCode = 1;
        return;
      }
      if (!(await getTokens(false, true, deploymentTypes))) {
        process.exitCode = 1;
        return;
      }
      if (
        !named &&
        !(await confirmBulkDelete({
          what,
          yes: options.yes,
          dryRun: options.dryRun,
          showPlan: showSecretDeletePlan,
        }))
      ) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Deleting secrets from cloud');
      const outcome = await configManagerDeleteSecrets(
        options.name,
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
