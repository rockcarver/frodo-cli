import { frodo } from '@rockcarver/frodo-lib';
import { configManagerExportOrgPrivilegesAllRealms } from '../../../configManagerOps/FrConfigOrgPrivilegesOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];
const { constants } = frodo.utils;

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull org-privileges',
    [],
    deploymentTypes
  );

  program
    .description('Export organization privileges config.')
    .multiOp()
    .usesRealm()
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      if (await getTokens(false, true, deploymentTypes)) {
        let outcome: boolean;
        const pickedRealm = realmOfRun(command, realm);
        if (pickedRealm !== constants.DEFAULT_REALM_KEY) {
          printMessage(
            `Exporting organization privileges config from the realm: "${pickedRealm}"`
          );
          outcome = await configManagerExportOrgPrivilegesAllRealms(
            pickedRealm,
            options.allowFailures,
            false
          );
        } else {
          printMessage(
            'Exporting oranization privileges config from all realms'
          );
          outcome = await configManagerExportOrgPrivilegesAllRealms(
            undefined,
            options.allowFailures
          );
        }

        if (!outcome) process.exitCode = 1;
      }
      // Any option combination is valid; the only way this branch runs
      // is getTokens() failing.
      else {
        process.exitCode = 1;
      }
    });

  return program;
}
