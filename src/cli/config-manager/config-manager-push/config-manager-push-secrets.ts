import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import {
  configManagerImportSecrets,
  findSecretVersionsToPrune,
} from '../../../configManagerOps/FrConfigSecretOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  printPrunePlan,
  summarizePrunePlan,
} from '../../../ops/cloud/SecretsOps';
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
    'frodo config-manager push secrets',
    [],
    deploymentTypes
  );

  program
    .description('Import secrets.')
    .addOption(
      selectorOption(
        '-i, --secret-id <id>',
        'Secret id; import only the specified secret',
        ['-n', '--name']
      )
    )

    .addOption(
      new Option(
        '--prune',
        'Prunes old versions that are still enabled before importing the new version(s). This deletes versions for good: on a terminal it shows them and asks first when more than one would be deleted (see -y and --dry-run); without a terminal it refuses unless -y is given.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before pruning. Required with --prune when there is no terminal. Has no effect without --prune.'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Only with --prune: show which versions would be pruned, without pruning or importing anything.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Import all secrets:\n` +
        c.command(`  $ frodo config-manager push secrets ${s.connId}\n`) +
        `  Import one secret:\n` +
        c.command(
          `  $ frodo config-manager push secrets -i esv-example ${s.connId}\n`
        ) +
        `  Show which old versions pruning would delete, without deleting or importing anything:\n` +
        c.command(
          `  $ frodo config-manager push secrets --prune --dry-run ${s.connId}\n`
        ) +
        `  Import all secrets and delete their old versions that are still enabled. Deleted versions cannot be recovered. Without -y a terminal is asked first if more than one version would be deleted; -y is required without a terminal:\n` +
        c.command(
          `  $ frodo config-manager push secrets --prune -y ${s.connId}\n`
        )
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

      const named = options.secretId !== undefined;
      const what = named
        ? `the old versions of secret ${options.secretId}`
        : 'the old versions of all secrets to import';
      if (options.prune) {
        // an empty id never means "all secrets" for a delete: the parser of
        // the selector refuses '' and this refuses a blank one, which would
        // select nothing (-i " ")
        if (named && options.secretId.trim() === '') {
          printMessage(
            'The secret id (-i) must not be empty with --prune. To prune the versions of all secrets, leave out -i.',
            'error'
          );
          process.exitCode = 1;
          return;
        }
        // a run that nobody can be asked about is refused before the login
        // (cli record 0037); how many versions it would delete is not known
        // before the tenant has been read
        if (
          !checkBulkDelete({
            what,
            yes: options.yes,
            dryRun: options.dryRun,
          })
        ) {
          process.exitCode = 1;
          return;
        }
      } else if (options.dryRun) {
        // a dry run that went on to import would be worse than none
        printMessage(
          '--dry-run only shows what --prune would delete. Add --prune, or leave --dry-run out to import.',
          'error'
        );
        process.exitCode = 1;
        return;
      }

      const getTokensIsSuccessful = await getTokens(
        false,
        true,
        deploymentTypes
      );
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }

      // with --yes the prune goes ahead as it always did; a dry run, which
      // wins over --yes, and a run that is to be asked about find the versions
      // it would delete first and show them
      if (options.prune && (options.dryRun || !options.yes)) {
        const check = await findSecretVersionsToPrune(
          options.secretId,
          options.allowFailures
        );
        if (!check) {
          process.exitCode = 1;
          return;
        }
        const showPlan = async () => {
          printPrunePlan(
            check.plan,
            check.keepLoaded,
            check.keepDeactivated,
            check.notChecked
          );
          return true;
        };
        if (options.dryRun) {
          await showPlan();
          printMessage(
            '\nDry run: nothing was pruned and nothing was imported.',
            'info'
          );
          if (!check.run.finish()) process.exitCode = 1;
          return;
        }
        // deleting one version of the one secret that was named is not a
        // bulk delete (record 0037: a single named target never asks); a
        // secret that could not be checked may hold many more
        const { versions } = summarizePrunePlan(check.plan);
        if (
          (versions > 1 || check.notChecked.length > 0) &&
          !(await confirmBulkDelete({ what, showPlan }))
        ) {
          printMessage('Nothing was pruned and nothing was imported.', 'info');
          process.exitCode = 1;
          return;
        }
      }

      verboseMessage('Importing secrets to cloud');
      const outcome = await configManagerImportSecrets(
        options.secretId,
        options.prune,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
