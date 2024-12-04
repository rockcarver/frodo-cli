import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { deleteSocialIdentityProviderById } from '../../ops/IdpOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo idp delete');

  program
    .description('Delete (social) identity providers.')
    .addOption(new Option('-i, --idp-id <idp-id>', 'Id/name of a provider.'))
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
        if ((await getTokens()) && options.idpId) {
          verboseMessage(
            `Deleting idp ${options.idpId} in realm "${state.getRealm()}"...`
          );
          const outcome = await deleteSocialIdentityProviderById(options.idpId);
          if (!outcome) process.exitCode = 1;
        } else {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
          program.help();
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
