import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteSchedules } from '../../../configManagerOps/FrConfigSchedulesOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete schedules',
    [],
    deploymentTypes
  );

  program
    .description('Delete schedules.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Schedule name; deletes only the specified schedule.'
      )
    )
    .addOption(
      new Option('-d, --dry-run', 'Show which schedules would be deleted.')
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Skip confirmation when deleting all schedules. Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all eligible schedules without prompting:\n` +
        c.command(
          `  $ frodo config-manager delete schedules -y ${s.connId}\n`
        ) +
        `  Preview deletion of all eligible schedules:\n` +
        c.command(
          `  $ frodo config-manager delete schedules -d ${s.connId}\n`
        ) +
        `  Delete a schedule by name:\n` +
        c.command(
          `  $ frodo config-manager delete schedules -n taskscan_activate ${s.connId}\n`
        ) +
        `  Preview deletion of a schedule by name:\n` +
        c.command(
          `  $ frodo config-manager delete schedules -n taskscan_activate -d ${s.connId}\n`
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
      const what = 'all eligible schedules';
      const deletesAll = options.name === undefined;
      if (
        deletesAll &&
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
        deletesAll &&
        !(await confirmBulkDelete({
          what,
          yes: options.yes,
          dryRun: options.dryRun,
          showPlan: () => configManagerDeleteSchedules(undefined, true),
        }))
      ) {
        process.exitCode = 1;
        return;
      }

      verboseMessage('Deleting schedules');
      const outcome = await configManagerDeleteSchedules(
        options.name,
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
