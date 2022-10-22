import { Command, Option } from 'commander';
import { Authenticate, Journey, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import {
  showSpinner,
  failSpinner,
  succeedSpinner,
  printMessage,
} from '../../utils/Console';

const { getTokens } = Authenticate;
const { disableJourney } = Journey;

const program = new Command('frodo journey disable');

program
  .description('Disable journeys/trees.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(
    new Option('-i, --journey-id <journey>', 'Name of a journey/tree.')
  )
  // .addOption(
  //   new Option(
  //     '-a, --all',
  //     'Disable all the journeys/trees in a realm. Ignored with -i.'
  //   )
  // )
  .action(
    // implement command logic inside action handler
    async (host, realm, user, password, options) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      if (await getTokens()) {
        // enable
        if (options.journeyId) {
          showSpinner(`Disabling journey ${options.journeyId}...`);
          if (await disableJourney(options.journeyId)) {
            succeedSpinner(`Disabled journey ${options.journeyId}.`);
          } else {
            failSpinner(`Disabling journey ${options.journeyId} failed.`);
          }
        }
        // unrecognized combination of options or no options
        else {
          printMessage('Unrecognized combination of options or no options...');
          program.help();
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
