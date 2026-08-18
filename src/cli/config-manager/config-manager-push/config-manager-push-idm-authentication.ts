import { frodo } from '@rockcarver/frodo-lib';

import { configManagerImportIdmAuthentication } from '../../../configManagerOps/FrConfigIdmAuthenticationOpts';
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
    'frodo config-manager push idm-authentication',
    [],
    deploymentTypes
  );

  program
    .description('Import idm authentication.')
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
      verboseMessage('Importing idm authentication configuration.');
      const outcome = await configManagerImportIdmAuthentication();
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
