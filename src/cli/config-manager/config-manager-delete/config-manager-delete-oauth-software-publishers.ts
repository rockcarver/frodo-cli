import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  configManagerDeleteSoftwarePublishers,
  showSoftwarePublisherDeletePlan,
} from '../../../ops/SoftwarePublisherConfigOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete oauth-software-publishers'
  );

  program
    .summary('Delete software publishers.')
    .description(
      'Delete OAuth2 software publishers from the tenant, by name or all of the selected realms. A software publisher is a trust anchor: a software statement it signs is accepted when a client registers itself, and once it is deleted such a registration is rejected until a publisher for it exists again. A realm that does not offer the agent type has nothing to delete. There is no undo; a tree in version control holds the files to push back.'
    )
    .addOption(
      new Option(
        '-n, --name <name>',
        'Software publisher name (the name of the object). If specified, deletes only that publisher, without asking. Needs a single realm.'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which software publishers would be deleted without deleting them.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting more than one software publisher (no -n). Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Preview the deletion of all software publishers of a realm:\n` +
        c.command(
          `  $ frodo config-manager delete oauth-software-publishers --dry-run ${s.connId} ${s.realm}\n`
        ) +
        `  Delete all software publishers of a realm without asking, which is required without a terminal (without -y a terminal is asked first). Registrations that present a software statement signed by these publishers are rejected afterwards:\n` +
        c.command(
          `  $ frodo config-manager delete oauth-software-publishers -y ${s.connId} ${s.realm}\n`
        ) +
        `  Delete one software publisher of a realm:\n` +
        c.command(
          `  $ frodo config-manager delete oauth-software-publishers -n ${s.softwarePublisherId} ${s.connId} ${s.realm}\n`
        ) +
        `  Preview the deletion of one software publisher:\n` +
        c.command(
          `  $ frodo config-manager delete oauth-software-publishers -n ${s.softwarePublisherId} --dry-run ${s.connId} ${s.realm}\n`
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

      // an empty name must never mean "all": "not given" and "given but empty"
      // are different (-n "$UNSET" gives an empty name)
      const named = options.name !== undefined;
      if (named && options.name.trim() === '') {
        printMessage(
          'The software publisher name must not be empty. To delete all software publishers, leave out -n.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      // only a single name is deleted without a question (cli record 0037); a
      // run that nobody can be asked about is refused before the login
      const what = 'all software publishers in the selected realms';
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
            showSoftwarePublisherDeletePlan(
              options.name,
              realmOfRun(command, realm)
            ),
        }))
      ) {
        process.exitCode = 1;
        return;
      }

      verboseMessage(
        named
          ? `Deleting software publisher "${options.name}".`
          : 'Deleting software publishers.'
      );
      const outcome = await configManagerDeleteSoftwarePublishers(
        options.name,
        realmOfRun(command, realm),
        options.dryRun,
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
