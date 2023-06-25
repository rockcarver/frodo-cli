import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { configManagerImportConnectors } from '../../../configManagerOps/FrConfigConnectorDefinitionsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push connector-definitions',
    [],
    deploymentTypes
  );

  program
    .description('Import connector definitions.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Connector definition name; imports only the specified connector definition.'
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
        verboseMessage('Importing connector definitions');
        const outcome = await configManagerImportConnectors(options.name);
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    });

  return program;
}
