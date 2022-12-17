import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, Journey } from '@rockcarver/frodo-lib';
import {
  showSpinner,
  failSpinner,
  succeedSpinner,
  printMessage,
} from '../../utils/Console';

const { getTokens } = Authenticate;
const { enableJourney } = Journey;

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
        showSpinner(`Enabling journey ${options.journeyId}...`);
        if (await enableJourney(options.journeyId)) {
          succeedSpinner(`Enabled journey ${options.journeyId}.`);
        } else {
          failSpinner(`Enabling journey ${options.journeyId} failed.`);
        }
      }
      // unrecognized combination of options or no options
      else {
        printMessage('Unrecognized combination of options or no options...');
        program.help();
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
