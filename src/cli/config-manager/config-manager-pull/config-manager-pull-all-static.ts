import { frodo } from '@rockcarver/frodo-lib';

import { configManagerExportAllStatic } from '../../../configManagerOps/FrConfigAllOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull all',
    [],
    deploymentTypes
  );
  // TO DO: adding a realm option to export all-static for specific realm
  program
    .description('Export all static config.')
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      if (!(await getTokens(false, true, deploymentTypes))) {
        process.exitCode = 1;
        return;
      }

      const outcome = await configManagerExportAllStatic();
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
