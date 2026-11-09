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
import { FrodoCommand } from '../FrodoCommand';

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
        // an unspecified appId gets a picker from the framework after the
        // login (decision record 0038), so the login comes first
        if (await getTokens()) {
          if (options.all) {
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
          } else if (options.appId) {
            const outcome = await deleteOauth2ClientById(options.appId);
            if (!outcome) process.exitCode = 1;
          } else {
            // the picker had nothing to offer
            verboseMessage('No OAuth2 client to delete.');
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
