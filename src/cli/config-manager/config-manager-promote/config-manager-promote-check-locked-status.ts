import { frodo } from '@rockcarver/frodo-lib';
import { configManagerCheckLockedStatus } from '../../../configManagerOps/FrConfigPromoteOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager promote check-promotion-status',
    [],
    deploymentTypes
  );

  program
    .description('Check the current promotion status.')
    .option(
      '-l, --local-lock-only',
      'Only show lock status of requested environment'
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
      const getTokensIsSuccessful = await getTokens(
        false,
        true,
        deploymentTypes
      );
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Getting lock status...');
      const outcome = await configManagerCheckLockedStatus(
        options.localLockOnly
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
