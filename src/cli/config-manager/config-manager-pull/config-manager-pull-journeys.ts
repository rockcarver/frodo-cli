import { Option } from 'commander';

import { configManagerExportJourneys } from '../../../configManagerOps/FrConfigJourneysOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const deploymentTypes = ['cloud', 'forgeops'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull journeys',
    [],
    deploymentTypes
  );

  program
    .description('Export journeys.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Journey name, It only export the journey with the name.'
      )
    )
    .addOption(
      new Option(
        '-r, --realm <realm>',
        'Specific realm to get journeys from (overrides environment)'
      )
    )
    .addOption(new Option('-d, --pull-dependencies', 'Pull dependencies.'))
    // TO DO: implementing for 'clean'
    // .addOption(
    //   new Option('-c, --clean', 'Clear existing configuration before pull.')
    // )
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      if (options.realm) {
        realm = options.realm;
      }

      if (await getTokens(false, true, deploymentTypes)) {
        verboseMessage('Exporting config entity journeys');
        const outcome = await configManagerExportJourneys(
          options.name,
          realm,
          options.pullDependencies
        );
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
    });

  return program;
}
