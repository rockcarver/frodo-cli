import { frodo } from '@rockcarver/frodo-lib';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { checkPromotionStatus } from '../../../ops/cloud/EnvPromotionOps';
import c from '../../../utils/ColorTheme';
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
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Check whether a promotion is running, ready or has failed (the connection profile is the tenant you promote to):\n` +
        c.command(
          `  $ frodo config-manager promote check-promotion-status ${s.connId}\n`
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
      verboseMessage('Checking promotion status.');
      const outcome = await checkPromotionStatus();
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
