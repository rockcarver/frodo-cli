import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteOauth2ClientById } from '../../ops/OAuth2ClientOps';
import {
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
import { FrodoCommand } from '../FrodoCommand';

/**
 * The client skeleton type isn't exported from frodo-lib's root; derive it
 * from the read function instead of importing an unexported name.
 */
type OAuth2ClientSkeleton = Awaited<
  ReturnType<typeof frodo.oauth2oidc.client.readOAuth2Clients>
>[number];

export default function setup() {
  const program = new FrodoCommand('frodo oauth client delete');

  program
    .description('Delete OAuth2 clients.')
    .addOption(
      new Option(
        '-i, --app-id <id>',
        'OAuth2 client id/name. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option('-a, --all', 'Delete all cmds in a realm. Ignored with -i.')
    )
    .addOption(
      new Option(
        '--no-deep',
        'No deep delete. This leaves orphaned configuration artifacts behind.'
      )
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
        // An unspecified appId prompts for a client from the live system
        // (no-op outside the prompt gate) before getTokens.
        if (
          (options.appId ||
            (await resolveEntityPicks(command, [
              entityPick<OAuth2ClientSkeleton>({
                name: 'appId',
                kind: 'OAuth2 client',
                load: () => frodo.oauth2oidc.client.readOAuth2Clients(),
                label: (client) => client._id ?? '',
              }),
            ]))) &&
          (await getTokens())
        ) {
          const outcome = deleteOauth2ClientById(options.appId);
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
