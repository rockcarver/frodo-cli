import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { configManagerImportCsp } from '../../../configManagerOps/FrConfigCspOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push csp',
    [],
    deploymentTypes
  );

  program
    .description('Import content security policy.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Policy name; import only the policy with the specified name.'
      )
    )
    .description('Import content security policy.')
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
      verboseMessage('Importing content security policy...');
      const outcome = await configManagerImportCsp(options.name);
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
