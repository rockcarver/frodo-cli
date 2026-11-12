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
import { printMessage, verboseMessage } from '../../../utils/Console';
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
        'Schedule name, the part of its id after schedule/ (for example taskscan_activate), matched exactly; delete only the specified schedule. If omitted, all schedules are deleted, after a confirmation or with -y.'
      )
    )
    .addOption(
      new Option(
        '--dry-run',
        'Show which schedules would be deleted without deleting them.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting more than one schedule (no -n). Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all schedules without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(
          `  $ frodo config-manager delete schedules -y ${s.connId}\n`
        ) +
        `  Preview the deletion of all schedules:\n` +
        c.command(
          `  $ frodo config-manager delete schedules --dry-run ${s.connId}\n`
        ) +
        `  Delete a schedule by name:\n` +
        c.command(
          `  $ frodo config-manager delete schedules -n taskscan_activate ${s.connId}\n`
        ) +
        `  Preview deletion of a schedule by name:\n` +
        c.command(
          `  $ frodo config-manager delete schedules -n taskscan_activate --dry-run ${s.connId}\n`
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
      // an empty name must never mean "all": "not given" and "given but empty"
      // are different (-n "$UNSET" gives an empty name)
      const named = options.name !== undefined;
      if (named && options.name.trim() === '') {
        printMessage(
          'The schedule name (-n) must not be empty. To delete all schedules, leave out -n.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      // a run that nobody can be asked about is refused before the login
      // (cli record 0037)
      const what = 'all schedules';
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
