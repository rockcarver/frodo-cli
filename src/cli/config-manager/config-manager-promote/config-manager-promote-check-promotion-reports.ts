import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { checkPromotionReports } from '../../../ops/cloud/EnvPromotionOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager promote check-promotion-reports',
    [],
    deploymentTypes
  );

  program
    .description(
      'Retrieve promotion reports. Defaults to the latest report if no option is specified.'
    )
    .addOption(
      new Option(
        '-l, --list',
        'List all promotion reports. Cannot be used with -i, -p or -r.'
      ).conflicts(['reportId', 'provisional', 'provisionalRollback'])
    )
    .addOption(
      new Option(
        '-i, --report-id <id>',
        'Retrieve a promotion report by ID. Cannot be used with -l, -p or -r.'
      ).conflicts(['list', 'provisional', 'provisionalRollback'])
    )
    .addOption(
      new Option(
        '-p, --provisional',
        'Retrieve the current provisional promotion report. Cannot be used with -l, -i or -r.'
      ).conflicts(['list', 'reportId', 'provisionalRollback'])
    )
    .addOption(
      new Option(
        '-r, --provisional-rollback',
        'Retrieve the current provisional rollback report. Cannot be used with -l, -i or -p.'
      ).conflicts(['list', 'reportId', 'provisional'])
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Show the latest promotion report:\n` +
        c.command(
          `  $ frodo config-manager promote check-promotion-reports ${s.connId}\n`
        ) +
        `  List all promotion reports:\n` +
        c.command(
          `  $ frodo config-manager promote check-promotion-reports --list ${s.connId}\n`
        ) +
        `  Show one promotion report by its ID:\n` +
        c.command(
          `  $ frodo config-manager promote check-promotion-reports --report-id 9b827cbd-d19b-4a5c-a78e-1d383b811d95 ${s.connId}\n`
        ) +
        `  Show what a promotion would change right now (the provisional report):\n` +
        c.command(
          `  $ frodo config-manager promote check-promotion-reports --provisional ${s.connId}\n`
        ) +
        `  Show what a rollback would change right now (the provisional rollback report):\n` +
        c.command(
          `  $ frodo config-manager promote check-promotion-reports --provisional-rollback ${s.connId}\n`
        )
    )
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      const getTokensIsSuccessful = await getTokens(
        false,
        true,
        deploymentTypes
      );
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Checking promotion reports.');
      const outcome = await checkPromotionReports({
        reportId: options.reportId,
        list: options.list,
        provisional: options.provisional,
        provisionalRollback: options.provisionalRollback,
      });
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
