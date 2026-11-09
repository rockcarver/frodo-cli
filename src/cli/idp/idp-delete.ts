import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteSocialIdentityProviderById } from '../../ops/IdpOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo idp delete');

  program
    .description('Delete (social) identity providers.')
    .addOption(new Option('-i, --idp-id <idp-id>', 'Id/name of a provider.'))
    .requireOneOf({ options: ['idpId'], purpose: 'what to delete' })
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
        // an unspecified idpId gets a picker from the framework after the
        // login (decision record 0038), so the login comes first
        if (await getTokens()) {
          if (options.idpId) {
            verboseMessage(
              `Deleting idp ${options.idpId} in realm "${state.getRealm()}"...`
            );
            const outcome = await deleteSocialIdentityProviderById(
              options.idpId
            );
            if (!outcome) process.exitCode = 1;
          } else {
            // the picker had nothing to offer
            verboseMessage('No identity provider to delete.');
            process.exitCode = 1;
          }
        } else {
          // getTokens() failed, or the user declined the pick
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
