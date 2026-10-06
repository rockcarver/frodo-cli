import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteTermsAndConditions } from '../../../configManagerOps/FrConfigTermsAndConditionsOps';
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
    'frodo config-manager delete terms-and-conditions',
    [],
    deploymentTypes
  );
  program
    .description('Delete terms and conditions versions.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Version identifier; deletes only the specified terms and conditions version.'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which terms and conditions versions would be deleted.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all eligible terms and conditions versions:\n` +
        c.command(
          `  $ frodo config-manager delete terms-and-conditions ${s.connId}\n`
        ) +
        `  Delete a specific version:\n` +
        c.command(
          `  $ frodo config-manager delete terms-and-conditions -n 0.1 ${s.connId}\n`
        ) +
        `  Preview deletion of a specific version:\n` +
        c.command(
          `  $ frodo config-manager delete terms-and-conditions -n 0.1 -d ${s.connId}\n`
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
      if (!(await getTokens(false, true, deploymentTypes))) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Deleting terms and conditions versions');
      const outcome = await configManagerDeleteTermsAndConditions(
        options.name,
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
