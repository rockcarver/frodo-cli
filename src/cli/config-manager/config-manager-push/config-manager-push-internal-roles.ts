import { frodo } from '@rockcarver/frodo-lib';
import { configManagerImportInternalRoles } from '../../../configManagerOps/FrConfigInternalRolesOps';
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
    'frodo config-manager push internal-roles',
    [],
    deploymentTypes
  );

  program

    .description('Import internal roles.')
    .addOption(
      selectorOption(
        '-i, --role-id <id>',
        'Internal role id, imports the specified role id. Cannot be used with -n.'
      ).conflicts(['roleName'])
    )
    .addOption(
      selectorOption(
        '-n, --role-name <name>',
        'Internal role name, imports the specified role name. Cannot be used with -i.',
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
        verboseMessage('Importing internal roles');
        const outcome = await configManagerImportInternalRoles(
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
