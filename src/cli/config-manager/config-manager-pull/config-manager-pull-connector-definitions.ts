import { Option } from 'commander';

import {
  configManagerExportConnectorDefinition,
  configManagerExportConnectorDefinitionsAll,
} from '../../../configManagerOps/FrConfigConnectorDefinitionsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const deploymentTypes = ['cloud'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull connector-definitions',
    [],
    deploymentTypes
  );

  program
    .description('Export aconnector definitions.')
    .addOption(
      new Option(
        '-n, --name <connector-name>',
        'Get connector-definition from specified name/id, without the type prefix.'
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
        let outcome: boolean;
        if (options.name) {
          printMessage(
            `Exporting connector definition for connector: "${options.name}"`
          );
          outcome = await configManagerExportConnectorDefinition({
            connectorName: options.name,
          });
        } else {
          printMessage('Exporting all connector defitions.');
          outcome = await configManagerExportConnectorDefinitionsAll();
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
