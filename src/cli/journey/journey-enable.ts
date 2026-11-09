import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { enableJourney } from '../../ops/JourneyOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo journey enable');

  program
    .description('Enable journeys/trees.')
    .addOption(
      new Option('-i, --journey-id <journey>', 'Name of a journey/tree.')
    )
    // .addOption(
    //   new Option(
    //     '-a, --all',
    //     'Enable all the journeys/trees in a realm. Cannot be used with -i.'
    //   ).conflicts(['journeyId'])
    // )
    .requireOneOf({ options: ['journeyId'], purpose: 'which journey' })
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Enable a journey using a connection profile:\n` +
        c.command(`  $ frodo journey enable -i ${s.journeyId} ${s.connId}\n`) +
        `  Enable a journey and log in with AM base URL, username, and password:\n` +
        c.command(
          `  $ frodo journey enable -i ${s.journeyId} ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
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
        // enable. On a terminal the framework offers a journey to pick, after
        // the login, when -i was left out (cli record 0038).
        if ((await getTokens()) && options.journeyId) {
          const outcome = await enableJourney(options.journeyId);
          if (!outcome) process.exitCode = 1;
        }
        // No branch ran: with requireOneOf satisfied, the only ways here are
        // getTokens() failing, a declined pick, or a realm with no journey to
        // pick from -- all exit 1, as before.
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
