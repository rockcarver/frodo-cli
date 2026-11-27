import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import {
  configManagerDeleteSecrets,
  showSecretDeletePlan,
} from '../../../configManagerOps/FrConfigSecretOps';
import { configManagerDeleteVariables } from '../../../configManagerOps/FrConfigVariableOps';
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
    'frodo config delete tenant-config',
    [],
    deploymentTypes
  );

  program
    .description(
      'Delete all ESV secrets and all ESV variables of the tenant, and nothing else. Deleted secret values cannot be recovered.'
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which ESV secrets and ESV variables would be deleted without deleting them.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Skip confirmation before deleting all ESV secrets and all ESV variables. Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Preview the deletion of all ESV secrets and all ESV variables:\n` +
        c.command(
          `  $ frodo config delete tenant-config --dry-run ${s.connId}\n`
        ) +
        `  Delete all ESV secrets and all ESV variables without asking, which is required without a terminal (without -y a terminal is asked first). The values of a deleted secret cannot be recovered, and nothing else is deleted:\n` +
        c.command(`  $ frodo config delete tenant-config -y ${s.connId}\n`)
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

      const what = 'all ESV secrets and all ESV variables';
      if (
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
        !(await confirmBulkDelete({
          what,
          yes: options.yes,
          dryRun: options.dryRun,
          showPlan: async () => {
            // the plan of the secrets also says that their values cannot be
            // recovered; both lists are read so that both failures are shown
            const secretsOk = await showSecretDeletePlan();
            const variablesOk = await configManagerDeleteVariables(
              undefined,
              true
            );
            if (!secretsOk || !variablesOk) return false;
            printMessage(
              'Only ESV secrets and ESV variables are deleted, nothing else.'
            );
            return true;
          },
        }))
      ) {
        process.exitCode = 1;
        return;
      }

      verboseMessage('Deleting tenant secrets and variables.');

      const secretsOk = await configManagerDeleteSecrets(
        undefined,
        options.dryRun,
        options.allowFailures
      );
      const variablesOk = await configManagerDeleteVariables(
        undefined,
        options.dryRun,
        options.allowFailures
      );

      if (!secretsOk || !variablesOk) process.exitCode = 1;
    });

  return program;
}
