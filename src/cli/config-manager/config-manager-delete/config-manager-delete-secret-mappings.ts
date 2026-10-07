import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteSecretMappings } from '../../../configManagerOps/FrConfigSecretMappingsOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, DEFAULT_REALM_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete secret-mappings',
    [],
    deploymentTypes
  );

  program
    .description('Delete secret mappings.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Secret mapping ID; delete only the specified mapping. If omitted, all mappings in the selected realms are deleted.'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which secret mappings would be deleted without deleting them.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Skip confirmation when deleting all secret mappings in the selected realms. Required without a terminal for bulk deletion.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all secret mappings in non-root realms without prompting:\n` +
        c.command(
          `  $ frodo config-manager delete secret-mappings -y ${s.connId}\n`
        ) +
        `  Preview deletion of all secret mappings in non-root realms:\n` +
        c.command(
          `  $ frodo config-manager delete secret-mappings -d ${s.connId}\n`
        ) +
        `  Delete a secret mapping by ID in the alpha realm:\n` +
        c.command(
          `  $ frodo config-manager delete secret-mappings -n example.secret.id ${s.connId} alpha\n`
        ) +
        `  Preview deletion of a secret mapping by ID in the alpha realm:\n` +
        c.command(
          `  $ frodo config-manager delete secret-mappings -n example.secret.id -d ${s.connId} alpha\n`
        )
    )
    .multiOp()
    .usesRealm()
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      if (options.name === '') {
        printMessage('The secret mapping ID (-n) must not be empty.', 'error');
        process.exitCode = 1;
        return;
      }

      const deletesAll = options.name === undefined;
      if (!deletesAll && (!realm || realm === DEFAULT_REALM_KEY)) {
        printMessage(
          'The -n/--name option requires a realm argument to be specified.',
          'error'
        );
        process.exitCode = 1;
        return;
      }

      const what = 'all secret mappings in the selected realms';
      const guardOptions = {
        what,
        yes: options.yes,
        dryRun: options.dryRun,
      };

      if (deletesAll && !checkBulkDelete(guardOptions)) {
        process.exitCode = 1;
        return;
      }

      if (!(await getTokens(false, true, deploymentTypes))) {
        process.exitCode = 1;
        return;
      }
      const selectedRealm = realmOfRun(command, realm);
      if (
        deletesAll &&
        !(await confirmBulkDelete({
          ...guardOptions,
          showPlan: () =>
            configManagerDeleteSecretMappings(undefined, selectedRealm, true),
        }))
      ) {
        process.exitCode = 1;
        return;
      }

      verboseMessage('Deleting secret mappings configuration.');
      const outcome = await configManagerDeleteSecretMappings(
        options.name,
        selectedRealm,
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
