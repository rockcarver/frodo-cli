import { Option } from 'commander';

import { configManagerExportServices } from '../../../configManagerOps/FrConfigServiceOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const deploymentTypes = ['cloud', 'forgeops'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull services',
    [],
    deploymentTypes
  );

  program
    .description('Export authentication services.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Service name, It only export the service with the name.'
      )
    )
    .addOption(
      new Option('-r, --realm <realm>', 'Specific realm to get service from')
    )

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
        verboseMessage('Exporting services');
        const outcome = await configManagerExportServices(realm, options.name);
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
