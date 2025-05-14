import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { importAuthenticationSettingsFromFile } from '../../ops/AuthenticationSettingsOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLASSIC_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const globalDeploymentTypes = [CLASSIC_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo authn import',
    [],
    globalDeploymentTypes
  );

  program
    .description('Import authentication settings.')
    .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
    .addOption(
      new Option('-g, --global', 'Export global authentication settings.')
    )
    .action(
      // implement command logic inside action handler
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        if (
          await getTokens(
            false,
            true,
            options.global ? globalDeploymentTypes : undefined
          )
        ) {
          verboseMessage('Importing authentication settings from file...');
          const outcome = importAuthenticationSettingsFromFile(
            options.file,
            options.global
          );
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
