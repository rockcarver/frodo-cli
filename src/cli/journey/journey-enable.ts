import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { enableJourney } from '../../ops/JourneyOps';
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
    //     'Enable all the journeys/trees in a realm. Ignored with -i.'
    //   )
    // )
    .requireOneOf({ options: ['journeyId'], purpose: 'which journey' })
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
        // enable
        if (options.journeyId && (await getTokens())) {
          const outcome = await enableJourney(options.journeyId);
          if (!outcome) process.exitCode = 1;
        }
        // No branch ran: with requireOneOf satisfied, the only way here is
        // getTokens() failing -- keep the old exit-1 semantics (the removed
        // else handled auth failure too).
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
