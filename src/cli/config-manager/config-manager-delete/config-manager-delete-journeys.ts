import { frodo } from '@rockcarver/frodo-lib';
import { configManagerDeleteJourneys } from '../../../configManagerOps/FrConfigJourneysOps';
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

const { DEFAULT_REALM_KEY } = frodo.utils.constants;

export default function setup() {
  const program = new FrodoCommand('frodo config-manager delete journeys');

  program
    .description(
      'Delete a journey by name or delete all journeys and clean up orphaned nodes in the selected realms.'
    )
    .option(
      '-n, --name <name>',
      'Delete the journey with this exact ID. Requires a realm argument.'
    )
    .option('-d, --dry-run', 'Show which journeys would be deleted.')
    .option(
      '-y, --yes',
      'Skip confirmation for bulk deletion. Required for bulk deletion without a terminal.'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all journeys and clean up orphaned nodes in the selected realms without prompting:\n` +
        c.command(`  $ frodo config-manager delete journeys -y ${s.connId}\n`) +
        `  Preview bulk journey deletion:\n` +
        c.command(`  $ frodo config-manager delete journeys -d ${s.connId}\n`) +
        `  Delete a journey by ID in the alpha realm:\n` +
        c.command(
          `  $ frodo config-manager delete journeys -n 'Example Journey' ${s.connId} alpha\n`
        ) +
        `  Preview deletion of a journey by ID in the alpha realm:\n` +
        c.command(
          `  $ frodo config-manager delete journeys -n 'Example Journey' -d ${s.connId} alpha\n`
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
      const bulk = options.name === undefined;
      if (!bulk && (!realm || realm === DEFAULT_REALM_KEY)) {
        printMessage(
          'The -n/--name option requires a realm argument to be specified.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      const guardOptions = {
        what: 'all journeys and orphaned nodes in the selected realms',
        yes: options.yes,
        dryRun: options.dryRun,
      };
      if (bulk && !checkBulkDelete(guardOptions)) {
        process.exitCode = 1;
        return;
      }
      if (!(await getTokens(false, true))) {
        process.exitCode = 1;
        return;
      }
      const selectedRealm = realmOfRun(command, realm);
      if (
        bulk &&
        !(await confirmBulkDelete({
          ...guardOptions,
          showPlan: () =>
            configManagerDeleteJourneys(undefined, selectedRealm, true),
        }))
      ) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Deleting journeys.');
      const outcome = await configManagerDeleteJourneys(
        options.name,
        selectedRealm,
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
