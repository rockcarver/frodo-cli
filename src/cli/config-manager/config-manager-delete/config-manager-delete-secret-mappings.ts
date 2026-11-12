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
        'Secret mapping ID (the secret id of the mapping, for example am.example.secret.id), matched exactly; delete only the specified mapping. Needs a single realm. If omitted, all secret mappings of the selected realms are deleted, after a confirmation or with -y.'
      )
    )
    .addOption(
      new Option(
        '--dry-run',
        'Show which secret mappings would be deleted without deleting them.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting more than one secret mapping (no -n). Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all secret mappings of all realms except the root realm without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(
          `  $ frodo config-manager delete secret-mappings -y ${s.connId}\n`
        ) +
        `  Preview the deletion of all secret mappings of all realms except the root realm:\n` +
        c.command(
          `  $ frodo config-manager delete secret-mappings --dry-run ${s.connId}\n`
        ) +
        `  Delete a secret mapping by ID in the alpha realm:\n` +
        c.command(
          `  $ frodo config-manager delete secret-mappings -n example.secret.id ${s.connId} alpha\n`
        ) +
        `  Preview the deletion of a secret mapping by ID in the alpha realm:\n` +
        c.command(
          `  $ frodo config-manager delete secret-mappings -n example.secret.id --dry-run ${s.connId} alpha\n`
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

      // an empty ID must never mean "all": "not given" and "given but empty"
      // are different (-n "$UNSET" gives an empty ID)
      const named = options.name !== undefined;
      if (named && options.name.trim() === '') {
        printMessage(
          'The secret mapping ID (-n) must not be empty. To delete all secret mappings, leave out -n.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      // the mappings of the secret store are per realm; the root realm has
      // none to delete, so naming it is an error and not a silent success
      if (realm === '/') {
        printMessage(
          'The root realm has no secret mappings to delete. Name a realm such as alpha, or leave the realm out to use every realm except the root realm.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      if (named && (!realm || realm === DEFAULT_REALM_KEY)) {
        printMessage(
          'The -n/--name option requires a realm argument to be specified.',
          'error'
        );
        process.exitCode = 1;
        return;
      }

      // only a single ID is deleted without a question (cli record 0037); a
      // run that nobody can be asked about is refused before the login
      const what = 'all secret mappings in the selected realms';
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
      const selectedRealm = realmOfRun(command, realm);
      if (
        !named &&
        !(await confirmBulkDelete({
          what,
          yes: options.yes,
          dryRun: options.dryRun,
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
