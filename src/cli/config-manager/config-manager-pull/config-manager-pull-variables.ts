import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { configManagerExportVariableByName, configManagerExportVariables } from '../../../configManagerOps/FrConfigVariableOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull variables',
    deploymentTypes
  );

  program
    .description('Export variables objects.')
    .addOption(
      new Option('-n, --name <name>', 'Export by name of variable object.')
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
        let outcome: boolean;
        if (options.name) {
          verboseMessage(`Exporting ${options.name}`);
          outcome = await configManagerExportVariableByName(options.name);
        } else {
          verboseMessage('Exporting variables');
          outcome = await configManagerExportVariables();
        }
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
