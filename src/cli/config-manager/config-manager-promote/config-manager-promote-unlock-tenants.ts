import { frodo } from '@rockcarver/frodo-lib';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { unlockTenants } from '../../../ops/cloud/EnvPromotionOps';
import c from '../../../utils/ColorTheme';
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
    .option(
      '-i, --id <id>',
      'Promotion ID associated with the lock. If not specified, it is read from the lock status of the environment.'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Unlock the environments after a promotion and wait until they are unlocked (the promotion ID is read from the lock status):\n` +
        c.command(
          `  $ frodo config-manager promote unlock-tenants ${s.connId}\n`
        ) +
        `  Unlock the environments of a specific promotion (the ID is the promotion ID that lock-tenants printed):\n` +
        c.command(
          `  $ frodo config-manager promote unlock-tenants --id 1d9ac1b3-b9a0-46d5-8d8c-0f3f2a1f8a21 ${s.connId}\n`
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
      verboseMessage('Unlocking tenants.');
      const outcome = await unlockTenants(options.id);
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
