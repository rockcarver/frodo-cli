import { frodo } from '@rockcarver/frodo-lib';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { checkLockedStatus } from '../../../ops/cloud/EnvPromotionOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager promote check-locked-status',
    [],
    deploymentTypes
  );

  program
    .description('Check the lock status of the environments.')
    .option(
      '-l, --local-lock-only',
      'Only show lock status of requested environment'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Check the lock status of both environments:\n` +
        c.command(
          `  $ frodo config-manager promote check-locked-status ${s.connId}\n`
        ) +
        `  Check only the lock status of the environment you are connected to:\n` +
        c.command(
          `  $ frodo config-manager promote check-locked-status --local-lock-only ${s.connId}\n`
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
      const outcome = await checkLockedStatus(options.localLockOnly);
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
