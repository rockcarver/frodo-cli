import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteSecrets } from '../../../configManagerOps/FrConfigSecretOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete secrets',
    [],
    deploymentTypes
  );

  program
    .description('Delete secrets.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Secret name; delete only the specified secret. If omitted, all secrets are deleted.'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which secrets would be deleted without deleting them.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all secrets:\n` +
        c.command(`  $ frodo config-manager delete secrets ${s.connId}\n`) +
        `  Delete a secret by name:\n` +
        c.command(
          `  $ frodo config-manager delete secrets -n esv-example ${s.connId}\n`
        ) +
        `  Preview deletion of a secret by name:\n` +
        c.command(
          `  $ frodo config-manager delete secrets -n esv-example -d ${s.connId}\n`
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
      verboseMessage('Deleting secrets from cloud');
      const outcome = await configManagerDeleteSecrets(
        options.name,
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
