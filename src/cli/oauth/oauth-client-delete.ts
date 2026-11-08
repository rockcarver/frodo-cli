import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteOauth2ClientById,
  deleteOauth2Clients,
} from '../../ops/OAuth2ClientOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import { verboseMessage } from '../../utils/Console';
import {
  deferEntityPicks,
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
        'OAuth2 client id/name. If specified, -a cannot be used.'
      ).conflicts(['all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all OAuth2 clients in a realm. Cannot be used with -i.'
      ).conflicts(['appId'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all OAuth2 clients. Required with -a when there is no terminal.'
      )
    )
    .addOption(
      new Option(
        '--no-deep',
        'No deep delete. This leaves orphaned configuration artifacts behind.'
      )
    )
    .requireOneOf({ options: ['all', 'appId'], purpose: 'what to delete' })
    .multiOp()
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
        // a run that nobody can be asked about is refused before the login
        // (cli record 0037)
        if (
          options.all &&
          !checkBulkDelete({
            what: 'all OAuth2 clients',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        // -a/--all
        if (options.all && (await getTokens())) {
          if (
            !(await confirmBulkDelete({
              what: 'all OAuth2 clients',
              yes: options.yes,
              dryRunAvailable: false,
            }))
          ) {
            process.exitCode = 1;
            return;
          }
          verboseMessage('Deleting all OAuth2 clients...');
          const outcome = await deleteOauth2Clients(options.allowFailures);
          if (!outcome) process.exitCode = 1;
        }
        // An unspecified appId prompts for a client from the live system
        // (no-op outside the prompt gate) before getTokens.
        else if (
          !options.all &&
          (options.appId || (await resolveEntityPicks(command))) &&
          (await getTokens())
        ) {
          const outcome = await deleteOauth2ClientById(options.appId);
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

  deferEntityPicks(program, [
    entityPick<OAuth2ClientSkeleton>({
      name: 'appId',
      kind: 'OAuth2 client',
      load: () => frodo.oauth2oidc.client.readOAuth2Clients(),
      label: (client) => client._id ?? '',
    }),
  ]);

  return program;
}
