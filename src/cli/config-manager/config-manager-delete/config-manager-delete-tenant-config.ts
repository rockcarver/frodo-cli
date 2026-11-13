import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteSecrets } from '../../../configManagerOps/FrConfigSecretOps';
import { configManagerDeleteVariables } from '../../../configManagerOps/FrConfigVariableOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete tenant-config',
    [],
    deploymentTypes
  );

  program
    .description(
      'Delete all secrets and variables from the tenant.'
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which secrets and variables would be deleted without deleting them.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Skip confirmation before deleting all secrets and variables. Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Preview deletion of all secrets and variables:\n` +
        c.command(
          `  $ frodo config-manager delete tenant-config --dry-run ${s.connId}\n`
        ) +
        `  Delete all secrets and variables without prompting:\n` +
        c.command(
          `  $ frodo config-manager delete tenant-config -y ${s.connId}\n`
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

      const what = 'all secrets and variables';
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
            const secretsOk = await configManagerDeleteSecrets(undefined, true);
            const variablesOk = await configManagerDeleteVariables(
              undefined,
              true
            );
            return secretsOk && variablesOk;
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
