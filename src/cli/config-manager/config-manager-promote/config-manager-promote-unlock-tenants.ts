import { frodo } from '@rockcarver/frodo-lib';
import { configManagerUnlockTenants } from '../../../configManagerOps/FrConfigPromoteOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager promote unlock-tenants',
    [],
    deploymentTypes
  );

  program
    .description('Unlock tenants and wait until they are unlocked.')
    .requiredOption('-i, --id <id>', 'Promotion ID associated with the lock.')
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
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Unlocking tenants.');
      const outcome = await configManagerUnlockTenants(options.id);
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
