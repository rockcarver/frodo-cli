import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteEndpoints } from '../../../configManagerOps/FrConfigEndpointsOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
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
    'frodo config-manager delete endpoints',
    [],
    deploymentTypes
  );

  program
    .description('Delete custom endpoint objects.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Endpoint name. If omitted, deletes all eligible endpoints.'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which custom endpoints would be deleted without deleting them.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all eligible custom endpoints:\n` +
        c.command(`  $ frodo config-manager delete endpoints ${s.connId}\n`) +
        `  Delete a custom endpoint by name:\n` +
        c.command(
          `  $ frodo config-manager delete endpoints -n Javascript ${s.connId}\n`
        ) +
        `  Preview deletion of a custom endpoint without deleting it:\n` +
        c.command(
          `  $ frodo config-manager delete endpoints -n Javascript -d ${s.connId}\n`
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
      verboseMessage('Deleting custom endpoints');
      const outcome = await configManagerDeleteEndpoints(
        options.name,
        options.dryRun
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
