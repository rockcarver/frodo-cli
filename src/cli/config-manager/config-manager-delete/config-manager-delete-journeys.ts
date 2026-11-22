import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteJourneys } from '../../../configManagerOps/FrConfigJourneysOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  checkProceed,
  confirmBulkDelete,
  confirmProceed,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { DEFAULT_REALM_KEY } = frodo.utils.constants;

export default function setup() {
  const program = new FrodoCommand('frodo config-manager delete journeys');

  program
    .description(
      'Delete one journey by id, or delete all journeys and clean up orphaned nodes in the selected realms. A journey that other objects still name is not deleted without --force.'
    )
    .addOption(
      selectorOption(
        '-i, --journey-id <id>',
        'Id (name) of the journey to delete. Requires a realm argument. If it is left out, all journeys are deleted.',
        ['-n', '--name']
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show what would be deleted or changed without deleting or changing anything.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all journeys, or before deleting a journey with --force. Required without a terminal.'
      )
    )
    .addOption(
      new Option(
        '--force',
        'Delete the journey with -i although other objects still name it. First the journey is cleared in the OAuth2 clients, SAML providers and AI agents that name it, and removed from the themes that link it. Every other object that names it is left alone, it names a journey that does not exist afterwards. What was cleared and what was left is printed. Only with -i.'
      )
    )
    .addOption(
      new Option(
        '--keep-links',
        'With --force: leave the links of the themes to the journey as they are. Only with -i and --force.'
      )
    )
    .addHelpText(
      'after',
      `Without --force, a journey that another journey, a realm setting, an OAuth2 client, a SAML provider, an AI agent, an agent group, a CIMD profile, a theme or a policy still names is not deleted, the command says which and exits with code 1. An answer that nothing names it is not proof that it is unused: a journey that an application, an SDK or a link starts by its name, or a journey name inside a script or a URL, is not seen.\n` +
        `Deleting all journeys deletes the journeys that the realm uses for login too, and every orphaned node of the realm. A dry run lists the orphaned nodes that exist now.\n` +
        `Usage Examples:\n` +
        `  Delete all journeys and clean up orphaned nodes in the selected realms without prompting:\n` +
        c.command(`  $ frodo config-manager delete journeys -y ${s.connId}\n`) +
        `  Preview the deletion of all journeys:\n` +
        c.command(`  $ frodo config-manager delete journeys -d ${s.connId}\n`) +
        `  Delete a journey in the alpha realm (refused if other objects still name it):\n` +
        c.command(
          `  $ frodo config-manager delete journeys -i '${s.journeyId}' ${s.connId} alpha\n`
        ) +
        `  Preview the deletion of a journey and what names it:\n` +
        c.command(
          `  $ frodo config-manager delete journeys -i '${s.journeyId}' -d ${s.connId} alpha\n`
        ) +
        `  Delete a journey that other objects name, after clearing it in them, without asking:\n` +
        c.command(
          `  $ frodo config-manager delete journeys -i '${s.journeyId}' --force -y ${s.connId} alpha\n`
        ) +
        `  Delete it the same way and leave the links of the themes as they are:\n` +
        c.command(
          `  $ frodo config-manager delete journeys -i '${s.journeyId}' --force --keep-links -y ${s.connId} alpha\n`
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
      const named = options.journeyId !== undefined;
      if (!named && (options.force || options.keepLinks)) {
        printMessage(
          `${options.force ? '--force' : '--keep-links'} applies to a named journey only: add -i/--journey-id, or leave it out.`,
          'error'
        );
        process.exitCode = 1;
        return;
      }
      if (options.keepLinks && !options.force) {
        printMessage(
          '--keep-links applies together with --force only: without --force a journey that a theme links is not deleted.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      if (named && (!realm || realm === DEFAULT_REALM_KEY)) {
        printMessage(
          'The -i, --journey-id option requires a realm argument to be specified.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      // a delete of all journeys, and a forced delete that changes the objects
      // naming the journey, are asked about, as for a command that can change
      // more than the one object it names
      // (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md);
      // a run that nobody can be asked about is refused before the login
      const guardOptions = {
        what: named
          ? `delete journey '${options.journeyId}' and change the objects that name it`
          : 'all journeys (the journeys that the realm uses for login included) and all orphaned nodes in the selected realms',
        yes: options.yes,
        dryRun: options.dryRun,
      };
      if (!named && !checkBulkDelete(guardOptions)) {
        process.exitCode = 1;
        return;
      }
      if (named && options.force && !checkProceed(guardOptions)) {
        process.exitCode = 1;
        return;
      }
      if (!(await getTokens(false, true))) {
        process.exitCode = 1;
        return;
      }
      const selectedRealm = realmOfRun(command, realm);
      const showPlan = () =>
        configManagerDeleteJourneys(
          options.journeyId,
          selectedRealm,
          true,
          false,
          { force: options.force, keepLinks: options.keepLinks }
        );
      if (!named && !(await confirmBulkDelete({ ...guardOptions, showPlan }))) {
        process.exitCode = 1;
        return;
      }
      if (
        named &&
        options.force &&
        !(await confirmProceed({
          ...guardOptions,
          warning: `Journey '${options.journeyId}' is deleted, and the objects listed above are changed. This cannot be undone.`,
          showPlan,
        }))
      ) {
        process.exitCode = 1;
        return;
      }
      verboseMessage(
        named
          ? `Deleting journey '${options.journeyId}'.`
          : 'Deleting journeys.'
      );
      const outcome = await configManagerDeleteJourneys(
        options.journeyId,
        selectedRealm,
        options.dryRun,
        options.allowFailures,
        { force: options.force, keepLinks: options.keepLinks }
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
