import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { enableJourney } from '../../ops/JourneyOps';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo journey enable', [], deploymentTypes);

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
        if (
          options.journeyId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          const outcome = await enableJourney(options.journeyId);
          if (!outcome) process.exitCode = 1;
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

  return program;
}
