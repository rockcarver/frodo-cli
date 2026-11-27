import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteEndpoints } from '../../../configManagerOps/FrConfigEndpointsOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config delete endpoints',
    [],
    deploymentTypes
  );

  program
    .description('Delete custom endpoint objects.')
    .addOption(
      selectorOption(
        '-i, --endpoint-id <id>',
        'Endpoint id; deletes only the specified endpoint. If omitted, deletes all eligible endpoints.',
        ['-n', '--name']
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which custom endpoints would be deleted without deleting them.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting more than one custom endpoint. Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all eligible custom endpoints without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(`  $ frodo config delete endpoints -y ${s.connId}\n`) +
        `  Preview the deletion of all eligible custom endpoints:\n` +
        c.command(`  $ frodo config delete endpoints -d ${s.connId}\n`) +
        `  Delete a custom endpoint by id:\n` +
        c.command(
          `  $ frodo config delete endpoints -i Javascript ${s.connId}\n`
        ) +
        `  Preview deletion of a custom endpoint without deleting it:\n` +
        c.command(
          `  $ frodo config delete endpoints -i Javascript -d ${s.connId}\n`
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
      const named = options.endpointId !== undefined;
      // a run that nobody can be asked about is refused before the login
      if (
        !named &&
        !checkBulkDelete({
          what: 'all eligible custom endpoints',
          yes: options.yes,
          dryRun: options.dryRun,
        })
      ) {
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
      if (
        !named &&
        !(await confirmBulkDelete({
          what: 'all eligible custom endpoints',
          yes: options.yes,
          dryRun: options.dryRun,
          showPlan: () => configManagerDeleteEndpoints(undefined, true),
        }))
      ) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Deleting custom endpoints');
      const outcome = await configManagerDeleteEndpoints(
        options.endpointId,
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
