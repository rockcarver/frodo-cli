import { frodo } from '@rockcarver/frodo-lib';

import { configManagerInitDirectConfigurationSession } from '../../../configManagerOps/FrConfigDirectControlOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push direct-control-init',
    [],
    deploymentTypes
  );

  program
    .description('Initialize a new direct configuration session.')
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
      verboseMessage('Initializing direct configuration session.');
      const outcome = await configManagerInitDirectConfigurationSession();
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
