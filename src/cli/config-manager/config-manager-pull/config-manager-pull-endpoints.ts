import { Option } from 'commander';

import { configManagerExportEndpoints } from '../../../configManagerOps/FrConfigEndpointsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const deploymentTypes = ['cloud', 'forgeops'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull endpoints',
    [],
    deploymentTypes
  );

  program
    .description('Export custom endpoints objects.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Endpoint name, It only export the endpoint with the name'
      )
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

      if (await getTokens(false, true, deploymentTypes)) {
        verboseMessage('Exporting config entity endpoints');
        const outcome = await configManagerExportEndpoints(options.name);
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
