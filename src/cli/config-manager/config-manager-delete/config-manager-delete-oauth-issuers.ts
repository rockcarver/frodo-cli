import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  configManagerDeleteTrustedJwtIssuers,
  showTrustedJwtIssuerDeletePlan,
} from '../../../ops/OAuth2TrustedJwtIssuerConfigOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

export default function setup() {
  const program = new FrodoCommand('frodo config delete oauth-issuers');

  program
    .summary('Delete trusted JWT issuers.')
    .description(
      'Delete OAuth2 trusted JWT issuers from the tenant, by id or all of the selected realms. A trusted JWT issuer is a trust anchor: a JWT signed by it is accepted as a grant, and once it is deleted that JWT is rejected until an issuer for it exists again. There is no undo; a tree in version control holds the files to push back.'
    )
    .addOption(
      selectorOption(
        '-i, --issuer-id <id>',
        'Trusted JWT issuer id (the id of the object, not its iss URL). If specified, deletes only that issuer, without asking. Needs a single realm.',
        ['-n', '--name']
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which trusted JWT issuers would be deleted without deleting them.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting more than one trusted JWT issuer (no -i). Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Preview the deletion of all trusted JWT issuers of a realm:\n` +
        c.command(
          `  $ frodo config delete oauth-issuers --dry-run ${s.connId} ${s.realm}\n`
        ) +
        `  Delete all trusted JWT issuers of a realm without asking, which is required without a terminal (without -y a terminal is asked first). Grants signed by these issuers are rejected afterwards:\n` +
        c.command(
          `  $ frodo config delete oauth-issuers -y ${s.connId} ${s.realm}\n`
        ) +
        `  Delete one trusted JWT issuer of a realm:\n` +
        c.command(
          `  $ frodo config delete oauth-issuers -i ${s.trustedJwtIssuerId} ${s.connId} ${s.realm}\n`
        ) +
        `  Preview the deletion of one trusted JWT issuer:\n` +
        c.command(
          `  $ frodo config delete oauth-issuers -i ${s.trustedJwtIssuerId} --dry-run ${s.connId} ${s.realm}\n`
        )
    )
    .multiOp()
    .usesRealm()
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      // an empty id must never mean "all": "not given" and "given but empty"
      // are different (-i "$UNSET" gives an empty id); an empty value is
      // refused while the command line is parsed, so this is a blank one
      const named = options.issuerId !== undefined;
      if (named && options.issuerId.trim() === '') {
        printMessage(
          'The trusted JWT issuer id (-i) must not be empty. To delete all trusted JWT issuers, leave out -i.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      // only a single id is deleted without a question, as for a command that
      // can delete more than the one object it names (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md); a run that nobody can
      // be asked about is refused before the login
      const what = 'all trusted JWT issuers in the selected realms';
      if (
        !named &&
        !checkBulkDelete({ what, yes: options.yes, dryRun: options.dryRun })
      ) {
        process.exitCode = 1;
        return;
      }
      if (!(await getTokens())) {
        process.exitCode = 1;
        return;
      }
      if (
        !named &&
        !(await confirmBulkDelete({
          what,
          yes: options.yes,
          dryRun: options.dryRun,
          showPlan: () =>
            showTrustedJwtIssuerDeletePlan(
              options.issuerId,
              realmOfRun(command, realm)
            ),
        }))
      ) {
        process.exitCode = 1;
        return;
      }

      verboseMessage(
        named
          ? `Deleting trusted JWT issuer "${options.issuerId}".`
          : 'Deleting trusted JWT issuers.'
      );
      const outcome = await configManagerDeleteTrustedJwtIssuers(
        options.issuerId,
        realmOfRun(command, realm),
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
