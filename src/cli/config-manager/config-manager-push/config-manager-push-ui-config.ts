import { frodo } from '@rockcarver/frodo-lib';

import { configManagerImportUiConfig } from '../../../configManagerOps/FrConfigUiConfigOps';
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
    'frodo config-manager push ui-config',
    [],
    deploymentTypes
  );

  program
    .description('Import UI configuration.')
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
        verboseMessage('Importing UI configuration...');
        const outcome = await configManagerImportUiConfig();
        if (!outcome) process.exitCode = 1;
      }
      // unrecognized combination of options or no options
      else {
        process.exitCode = 1;
      }
    });

  return program;
}
