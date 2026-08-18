import { frodo } from '@rockcarver/frodo-lib';

import { configManagerExportIdmAuthentication } from '../../../configManagerOps/FrConfigIdmAuthenticationOpts';
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
    'frodo config-manager pull idm-authentication',
    [],
    deploymentTypes
  );

  program
    .description('Export idm authentication config.')
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      const getTokensIsSuccessful = await getTokens(
        false,
        true,
        deploymentTypes
      );
      if (!getTokensIsSuccessful) process.exit(1);
      verboseMessage('Exporting idm authentication configuration.');
      const outcome = await configManagerExportIdmAuthentication();
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
