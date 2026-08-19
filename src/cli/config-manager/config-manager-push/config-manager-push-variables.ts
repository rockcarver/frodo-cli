import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { configManagerImportVariables } from '../../../configManagerOps/FrConfigVariableOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push variables',
    [],
    deploymentTypes
  );
  program
    .description('Import variables.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Variable name; import only the specified variable. If omitted, all variables are imported.'
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
      verboseMessage('Importing variables');
      const outcome = await configManagerImportVariables(options.name);
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
