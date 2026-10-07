import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteVariables } from '../../../configManagerOps/FrConfigVariableOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
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
        'Variable name; delete only the specified variable. If omitted, all variables are deleted.'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which variables would be deleted without deleting them.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all variables:\n` +
        c.command(`  $ frodo config-manager delete variables ${s.connId}\n`) +
        `  Delete a variable by name:\n` +
        c.command(
          `  $ frodo config-manager delete variables -n esv-example ${s.connId}\n`
        ) +
        `  Preview deletion of a variable by name:\n` +
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
      if (!(await getTokens(false, true, deploymentTypes))) {
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
