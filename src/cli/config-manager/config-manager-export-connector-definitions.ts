import { Option } from 'commander';

import {
  exportAllConnectorDefinitions,
  exportConnectorDefinition,
} from '../../configManagerOps/FrConfigConnectorDefinitionsOps';
import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const deploymentTypes = ['cloud'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager export connector-definitions',
    [],
    deploymentTypes
  );

  program
    .description('Export aconnector definitions.')
    .addOption(
      new Option(
        '-c, --c-name <connector-name>',
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
        if (options.cName) {
          printMessage(
            `Exporting connector definition for connector: "${options.cName}"`
          );
          outcome = await exportConnectorDefinition({
            connectorName: options.cName,
          });
        } else {
          printMessage('Exporting all connector defitions.');
          outcome = await exportAllConnectorDefinitions();
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
