import { frodo } from '@rockcarver/frodo-lib';

import { configManagerRestart } from '../../../configManagerOps/FrConfigRestartOps.ts';
import { getTokens } from '../../../ops/AuthenticateOps';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push restart',
    [],
    deploymentTypes
  );
  program
    .description('Restart the environment.')
    .addOption(
      program.createOption('-s, --status', 'Check restart status only.')
    )
    .addOption(
      program.createOption('-c, --check', 'Only restart if ESVs need loading.')
    )
    .addOption(
      program.createOption('-w, --wait', 'Wait for restart to complete.')
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
      const outcome = await configManagerRestart(
        options.status,
        options.check,
        options.wait
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
