import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerExportOrgPrivileges } from '../../../configManagerOps/FrConfigOrgPrivilegesOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
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
    .addOption(
      new Option(
        '-n, --name <name>',
        'Organization privileges name: privilegeAssignments, or the configuration of a realm (for example alphaOrgPrivileges). If specified, only exports that configuration; it has to belong to the realm if one is given.'
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

      if (await getTokens(false, true, deploymentTypes)) {
        const pickedRealm = realmOfRun(command, realm);
        const oneRealm =
          pickedRealm !== constants.DEFAULT_REALM_KEY ? pickedRealm : undefined;
        if (options.name) {
          verboseMessage(
            `Exporting organization privileges config "${options.name}"`
          );
        } else if (oneRealm) {
          verboseMessage(
            `Exporting organization privileges config from the realm: "${oneRealm}"`
          );
        } else {
          verboseMessage(
            'Exporting organization privileges config from all realms'
          );
        }
        const outcome = await configManagerExportOrgPrivileges(
          options.name,
          options.allowFailures,
          oneRealm
        );
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
