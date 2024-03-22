import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { deleteJourney, deleteJourneys } from '../../ops/JourneyOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const program = new FrodoCommand('frodo journey delete');

program
  .description('Delete journeys/trees.')
  .addOption(
    new Option(
      '-i, --journey-id <journey>',
      'Name of a journey/tree. If specified, -a is ignored.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Delete all the journeys/trees in a realm. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '--no-deep',
      'No deep delete. This leaves orphaned configuration artifacts behind.'
    )
  )
  .addOption(
    new Option(
      '--verbose',
      'Verbose output during command execution. If specified, may or may not produce additional output.'
    ).default(false, 'off')
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
      // delete by id
      if (options.journeyId && (await getTokens())) {
        verboseMessage(
          `Deleting journey ${
            options.journeyId
          } in realm "${state.getRealm()}"...`
        );
        const outcome = await deleteJourney(options.journeyId, options);
        if (!outcome) process.exitCode = 1;
      }
      // --all -a
      else if (options.all && (await getTokens())) {
        verboseMessage('Deleting all journeys...');
        const outcome = await deleteJourneys(options);
        if (!outcome) process.exitCode = 1;
      }
      // unrecognized combination of options or no options
      else {
        printMessage(
          'Unrecognized combination of options or no options...',
          'error'
        );
        program.help();
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
