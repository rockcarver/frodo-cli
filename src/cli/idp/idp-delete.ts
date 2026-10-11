import { frodo, state, type SocialIdpSkeleton } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteSocialIdentityProviderById } from '../../ops/IdpOps';
import { verboseMessage } from '../../utils/Console';
import {
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
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
        // An unspecified idpId prompts for a provider from the live system
        // (no-op outside the prompt gate) before getTokens.
        if (
          (options.idpId ||
            (await resolveEntityPicks(command, [
              entityPick<SocialIdpSkeleton>({
                name: 'idpId',
                kind: 'identity provider',
                load: () =>
                  frodo.oauth2oidc.external.readSocialIdentityProviders(),
                label: (idp) => idp._id ?? '',
              }),
            ]))) &&
          (await getTokens())
        ) {
          verboseMessage(
            `Deleting idp ${options.idpId} in realm "${state.getRealm()}"...`
          );
          const outcome = await deleteSocialIdentityProviderById(options.idpId);
          if (!outcome) process.exitCode = 1;
        }
        // The only ways no branch runs are getTokens() failing (keep the
        // old exit-1 semantics) or the user escaping the entity picker.
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
