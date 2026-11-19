import { frodo } from '@rockcarver/frodo-lib';
import { configManagerImportOrgPrivileges } from '../../../configManagerOps/FrConfigOrgPrivilegesOps';
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
    'frodo config-manager push org-privileges',
    [],
    deploymentTypes
  );

  program
    .description('Import organization privileges config.')
    .addOption(
      selectorOption(
        '-i, --org-privileges-id <id>',
        'Organization privileges id; only imports the privileges with the specified id.',
        ['-n', '--name']
      )
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

      const getTokensIsSuccessful = await getTokens(
        false,
        true,
        deploymentTypes
      );
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }
      verboseMessage(
        `Importing organization privileges config for ${options.orgPrivilegesId || 'all realms'}`
      );
      const outcome = await configManagerImportOrgPrivileges(
        options.orgPrivilegesId,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
