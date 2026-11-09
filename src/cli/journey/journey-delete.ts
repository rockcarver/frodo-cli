import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteJourney, deleteJourneys } from '../../ops/JourneyOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import c from '../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo journey delete');

  program
    .description('Delete journeys/trees.')
    .multiOp()
    .addOption(
      new Option(
        '-i, --journey-id <journey>',
        'Name of a journey/tree. Cannot be used with -a.'
      ).conflicts(['all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all the journeys/trees in a realm. Cannot be used with -i.'
      ).conflicts(['journeyId'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all journeys. Required with -a when there is no terminal.'
      )
    )
    .addOption(
      new Option(
        '--deep',
        'Deep delete. Also delete journey node artifacts (for older AM versions).'
      )
    )
    .addOption(
      new Option(
        '--no-deep',
        'Deprecated compatibility flag. Deep delete is disabled by default.'
      ).hideHelp()
    )
    .requireOneOf({ options: ['all', 'journeyId'], purpose: 'what to delete' })
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete a journey using a connection profile:\n` +
        c.command(`  $ frodo journey delete -i ${s.journeyId} ${s.connId}\n`) +
        `  Delete all journeys in a realm and log in with AM base URL, username, and password:\n` +
        c.command(
          `  $ frodo journey delete -a -y ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Deep-delete a journey and its node artifacts:\n` +
        c.command(
          `  $ frodo journey delete -i ${s.journeyId} --deep ${s.connId}\n`
        )
    )
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
            what: 'all journeys',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        // Default to shallow delete. --deep explicitly opts into legacy deep behavior.
        const deep = options.deep === true;
        const verbose = state.getVerbose();
        const deleteJourneyOptions = { deep, verbose, progress: true };
        const deleteJourneysOptions = { deep, verbose };
        // On a terminal the framework offers a journey to pick, after the
        // login, when -i was left out (cli record 0038). A failed login, a
        // declined pick and a failed read all stop here.
        if (!(await getTokens())) {
          process.exitCode = 1;
          return;
        }
        if (options.journeyId) {
          verboseMessage(
            `Deleting journey ${
              options.journeyId
            } in realm "${state.getRealm()}"...`
          );
          const outcome = await deleteJourney(
            options.journeyId,
            deleteJourneyOptions
          );
          if (!outcome) process.exitCode = 1;
        } else if (options.all) {
          if (
            !(await confirmBulkDelete({
              what: 'all journeys',
              yes: options.yes,
              dryRunAvailable: false,
            }))
          ) {
            process.exitCode = 1;
            return;
          }
          verboseMessage('Deleting all journeys...');
          const outcome = await deleteJourneys(
            deleteJourneysOptions,
            options.allowFailures
          );
          if (!outcome) process.exitCode = 1;
        } else {
          // an empty list leaves nothing to pick from
          printMessage('No journeys found to delete.');
        }
      }
      // end command logic inside action handler
    );

  return program;
}
