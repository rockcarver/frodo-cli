import { frodo } from '@rockcarver/frodo-lib';
import { configManagerExportInternalRoles } from '../../../configManagerOps/FrConfigInternalRolesOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull internal-roles',
    [],
    deploymentTypes
  );

  program

    .description('Export internal roles.')
    .addOption(
      selectorOption(
        '-i, --role-id <id>',
        'Internal role id. If specified, only export the internal role with the specified id. Cannot be used with -n.'
      ).conflicts(['roleName'])
    )
    .addOption(
      selectorOption(
        '-n, --role-name <name>',
        'Internal role name. If specified, only export the internal role with the specified name. Cannot be used with -i.',
        ['--name']
      ).conflicts(['roleId'])
    )
    .multiOp()
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
        verboseMessage('Exporting internal roles');
        const outcome = await configManagerExportInternalRoles(
          options.roleName,
          options.allowFailures,
          options.roleId
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
