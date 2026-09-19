import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { configManagerApplyDirectConfigurationSession } from '../../../configManagerOps/FrConfigDirectControlOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push direct-control-apply',
    [],
    deploymentTypes
  );

  program
    .description('Apply changes made during a direct configuration session.')
    .addOption(
      new Option(
        '-w, --wait',
        'Wait for the direct configuration session to reach an applied state before exiting.'
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
      if (!getTokensIsSuccessful) process.exit(1);
      verboseMessage('Applying changes from direct configuration session.');
      const outcome = await configManagerApplyDirectConfigurationSession(
        options.wait
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
