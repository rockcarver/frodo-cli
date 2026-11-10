import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
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
    'frodo config-manager delete variables',
    [],
    deploymentTypes
  );

  program
    .description('Delete variables.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Variable id, the whole id (for example esv-example); delete only that variable. If omitted, all variables are deleted.'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which variables would be deleted without deleting them.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting more than one variable (no -n). Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all variables without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(
          `  $ frodo config-manager delete variables -y ${s.connId}\n`
        ) +
        `  Preview the deletion of all variables:\n` +
        c.command(
          `  $ frodo config-manager delete variables -d ${s.connId}\n`
        ) +
        `  Delete a variable by its id:\n` +
        c.command(
          `  $ frodo config-manager delete variables -n esv-example ${s.connId}\n`
        ) +
        `  Preview the deletion of a variable by its id:\n` +
        c.command(
          `  $ frodo config-manager delete variables -n esv-example -d ${s.connId}\n`
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
      // Deleting all variables is the form without a name; a name that is
      // given but empty (an unset shell variable) is not "all".
      const deletesAll = options.name === undefined;
      const what = 'all variables';
      // a run that nobody can be asked about is refused before the login
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
          showPlan: () => configManagerDeleteVariables(undefined, true),
        }))
      ) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Deleting variables');
      const outcome = await configManagerDeleteVariables(
        options.name,
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
