import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteOAuth2TrustedJwtIssuerById,
  deleteOAuth2TrustedJwtIssuers,
  printTrustedIssuerPlan,
} from '../../ops/OAuth2TrustedJwtIssuerOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import c from '../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const WHAT = 'all trusted JWT issuers';

export default function setup() {
  const program = new FrodoCommand('frodo oauth issuer delete');

  program
    .description('Delete OAuth2 trusted JWT issuers.')
    .addOption(
      new Option(
        '-i, --issuer-id <issuer-id>',
        'Trusted issuer id: the name of the object in the realm, not the issuer URL (iss) that its assertions carry. Cannot be used with -a.'
      ).conflicts(['all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all trusted JWT issuers of the realm. Cannot be used with -i.'
      ).conflicts(['issuerId'])
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which trusted issuers would be deleted and delete nothing. Only with -a. Cannot be used with -i.'
      ).conflicts(['issuerId'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all trusted issuers. Required with -a when there is no terminal.'
      )
    )
    .requireOneOf({
      options: ['all', 'issuerId'],
      purpose: 'what to delete',
    })
    .multiOp()
    .addHelpText(
      'after',
      `Deleting a trusted issuer removes a trust anchor: assertions signed by it are refused afterwards, and so are the flows that depend on it (the RFC 7523 grant of a client that names it). ${c.command('frodo agent delete -a')} does not delete trusted issuers.\n\n` +
        `Usage Examples:\n` +
        `  Delete the trusted issuer '${s.trustedIssuerId}' and log in with AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo oauth issuer delete -i ${s.trustedIssuerId} ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Show which trusted issuers would be deleted by -a, and delete nothing:\n` +
        c.command(`  $ frodo oauth issuer delete -a --dry-run ${s.connId}\n`) +
        `  Delete all trusted issuers without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(`  $ frodo oauth issuer delete -a --yes ${s.connId}\n`)
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
        // a run that nobody can be asked about is refused before the login
        // (cli record 0037)
        if (
          options.all &&
          !checkBulkDelete({
            what: WHAT,
            yes: options.yes,
            dryRun: options.dryRun,
            dryRunAvailable: true,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        // an unspecified -i gets a picker from the framework after the login
        // (decision record 0038), so the login comes first
        if (await getTokens()) {
          if (options.issuerId) {
            verboseMessage(`Deleting trusted issuer ${options.issuerId}...`);
            const outcome = await deleteOAuth2TrustedJwtIssuerById(
              options.issuerId
            );
            if (!outcome) process.exitCode = 1;
          } else if (options.all) {
            if (
              !(await confirmBulkDelete({
                what: WHAT,
                yes: options.yes,
                dryRun: options.dryRun,
                dryRunAvailable: true,
                showPlan: printTrustedIssuerPlan,
              }))
            ) {
              process.exitCode = 1;
              return;
            }
            verboseMessage(
              options.dryRun
                ? 'Showing the trusted issuers a delete of all of them would remove...'
                : 'Deleting all trusted issuers...'
            );
            const outcome = await deleteOAuth2TrustedJwtIssuers(
              options.allowFailures,
              options.dryRun
            );
            if (!outcome) process.exitCode = 1;
          } else {
            // Neither was given and the pick found no issuer (an empty list counts
            // as satisfied): there is nothing to delete, and nothing to confirm.
            printMessage('No trusted JWT issuers found to delete.');
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
