import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteTelemetry } from '../../../configManagerOps/FrConfigTelemetryOps';
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
    'frodo config delete telemetry',
    [],
    deploymentTypes
  );

  program
    .description('Delete telemetry exporters.')
    .addOption(
      new Option(
        '-c, --category <category>',
        'Telemetry category to delete. If omitted, the exporters of every category are deleted, after a confirmation or with -y.'
      ).choices(['otlp', 'splunk'])
    )
    .addOption(
      selectorOption(
        '-i, --exporter-id <id>',
        'Id of a single exporter to delete, matched exactly. Requires --category.',
        ['-n', '--name']
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Preview telemetry exporters that would be deleted without deleting them.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Skip confirmation for bulk deletion. Required for bulk deletion without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all telemetry exporters without prompting:\n` +
        c.command(`  $ frodo config delete telemetry -y ${s.connId}\n`) +
        `  Preview deletion of all telemetry exporters:\n` +
        c.command(`  $ frodo config delete telemetry -d ${s.connId}\n`) +
        `  Delete all OTLP exporters without prompting:\n` +
        c.command(
          `  $ frodo config delete telemetry -c otlp -y ${s.connId}\n`
        ) +
        `  Delete a specific OTLP exporter by id:\n` +
        c.command(
          `  $ frodo config delete telemetry -c otlp -i test-otlp ${s.connId}\n`
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
      // an empty id must never mean "all": "not given" and "given but empty"
      // are different (-i "$UNSET" gives an empty id); an empty value is
      // refused while the command line is parsed, so this is a blank one
      if (
        options.exporterId !== undefined &&
        options.exporterId.trim() === ''
      ) {
        printMessage(
          'The telemetry exporter id (-i) must not be empty.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      if (options.exporterId !== undefined && !options.category) {
        printMessage(
          'Named telemetry config requires category (e.g. --category otlp)',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      const bulk = options.exporterId === undefined;
      const what = options.category
        ? `all telemetry exporters in category '${options.category}'`
        : 'all telemetry exporters';
      if (
        bulk &&
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
        bulk &&
        !(await confirmBulkDelete({
          what,
          yes: options.yes,
          dryRun: options.dryRun,
          showPlan: () =>
            configManagerDeleteTelemetry(options.category, undefined, true),
        }))
      ) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Deleting telemetry.');
      const outcome = await configManagerDeleteTelemetry(
        options.category,
        options.exporterId,
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
