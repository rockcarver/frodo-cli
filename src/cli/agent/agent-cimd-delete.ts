import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteCIMDProfile,
  deleteCIMDProfiles,
  printCIMDProfilePlan,
} from '../../ops/CIMDProfileOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo agent cimd delete');

  program
    .description('Delete CIMD profiles.')
    .addOption(
      new Option(
        '-i, --agent-id <agent-id>',
        'Agent id: the id of the CIMD profile. Cannot be used with -a or --dry-run.'
      ).conflicts(['all', 'dryRun'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all CIMD profiles. Cannot be used with -i.'
      ).conflicts(['agentId'])
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which CIMD profiles would be deleted and delete nothing. Only with -a. Cannot be used with -i.'
      ).conflicts(['agentId'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all CIMD profiles. Required with -a when there is no terminal.'
      )
    )
    .requireOneOf({
      options: ['all', 'agentId'],
      purpose: 'what to delete',
    })
    .addHelpText(
      'after',
      `Deleting a CIMD profile removes it from the allow-list of the realm. Clients whose client_id matched only that profile are refused with invalid_client afterwards.\n\n` +
        `Usage Examples:\n` +
        `  Delete the CIMD profile '${s.cimdProfileId}' and log in with AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo agent cimd delete -i ${s.cimdProfileId} ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Show which CIMD profiles would be deleted by -a, and delete nothing:\n` +
        c.command(`  $ frodo agent cimd delete -a --dry-run ${s.connId}\n`) +
        `  Delete all CIMD profiles without asking, which is required without a terminal (without --yes a terminal is asked first):\n` +
        c.command(`  $ frodo agent cimd delete -a --yes ${s.connId}\n`)
    )
    .multiOp()
    .action(
      // implement command logic inside action handler
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        // a run that nobody can be asked about is refused before the login
        // (cli record 0037)
        if (
          options.all &&
          !checkBulkDelete({
            what: 'all CIMD profiles',
            yes: options.yes,
            dryRun: options.dryRun,
            dryRunAvailable: true,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        // The family's picker (record 0038) has run inside getTokens when -i was
        // missing on a terminal; a declined pick or a failed load ends up in the
        // else below, like a failed login.
        if (await getTokens()) {
          let outcome: boolean;
          if (options.all) {
            if (
              !(await confirmBulkDelete({
                what: 'all CIMD profiles',
                yes: options.yes,
                dryRun: options.dryRun,
                dryRunAvailable: true,
                showPlan: () => printCIMDProfilePlan(),
              }))
            ) {
              process.exitCode = 1;
              return;
            }
            verboseMessage(
              options.dryRun
                ? 'Showing which CIMD profiles would be deleted...'
                : 'Deleting all CIMD profiles...'
            );
            outcome = await deleteCIMDProfiles(
              options.allowFailures,
              options.dryRun
            );
          } else {
            // -i; it is unset when the picker found no profile (an empty list
            // counts as satisfied): there is nothing to delete and nothing to
            // confirm, and never a fall through to the delete of everything
            verboseMessage(`Deleting CIMD profile ${options.agentId}...`);
            outcome = await deleteCIMDProfile(options.agentId);
          }
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
