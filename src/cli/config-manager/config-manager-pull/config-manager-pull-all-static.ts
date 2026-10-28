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
    'frodo config-manager pull all-static',
    [],
    deploymentTypes
  );
  program
    .description('Export all static config.')
    .addHelpText(
      'after',
      '\nNote: with a realm, the realm-specific config is exported for that realm only. The result is a partial snapshot, which cannot be promoted by itself, because promotion always covers all realms. Tenant-wide config is always exported in full.\n'
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

      if (!(await getTokens(false, true, deploymentTypes))) {
        process.exitCode = 1;
        return;
      }

      const outcome = await configManagerExportAllStatic({ realm });
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
