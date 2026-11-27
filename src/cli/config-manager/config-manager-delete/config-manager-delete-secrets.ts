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
import { selectorOption } from '../../SelectorOption';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config delete secrets',
    [],
    deploymentTypes
  );

  program
    .description('Delete secrets.')
    .addOption(
      selectorOption(
        '-i, --secret-id <id>',
        'Secret id (for example esv-example), matched exactly; delete only the specified secret. If omitted, all secrets are deleted.',
        ['-n', '--name']
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
        'Do not ask for confirmation before deleting more than one secret (no -i). Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete a secret by id:\n` +
        c.command(
          `  $ frodo config delete secrets -i esv-example ${s.connId}\n`
        ) +
        `  Preview deletion of a secret by id:\n` +
        c.command(
          `  $ frodo config delete secrets -i esv-example -d ${s.connId}\n`
        ) +
        `  Preview the deletion of all secrets:\n` +
        c.command(`  $ frodo config delete secrets -d ${s.connId}\n`) +
        `  Delete all secrets without asking, which is required without a terminal (without -y a terminal is asked first). The values of a deleted secret cannot be recovered:\n` +
        c.command(`  $ frodo config delete secrets -y ${s.connId}\n`)
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
      // an empty id must never mean "all": "not given" and "given but empty"
      // are different (-i "$UNSET" gives an empty id); an empty value is
      // refused while the command line is parsed, so this is a blank one
      const named = options.secretId !== undefined;
      if (named && options.secretId.trim() === '') {
        printMessage(
          'The secret id (-i) must not be empty. To delete all secrets, leave out -i.',
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
        options.secretId,
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
