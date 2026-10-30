import { frodo } from '@rockcarver/frodo-lib';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { lockTenants } from '../../../ops/cloud/EnvPromotionOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager promote lock-tenants',
    [],
    deploymentTypes
  );

  program
    .description('Lock tenants and wait until they are locked.')
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Lock the environments before a promotion and wait until they are locked. The output holds the promotion ID that unlock-tenants needs:\n` +
        c.command(`  $ frodo config-manager promote lock-tenants ${s.connId}\n`)
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
      verboseMessage('Locking tenants.');
      const outcome = await lockTenants();
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
