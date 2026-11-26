import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteRemoteServers } from '../../../configManagerOps/FrConfigRemoteServersOps';
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
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete connector-servers',
    [],
    deploymentTypes
  );

  program
    .description(
      'Delete one connector server by name, or delete all of them. A connector server that a server cluster or a connector still names is not deleted without --force.'
    )
    .addOption(
      selectorOption(
        '-i, --server-id <id>',
        'Name of the connector server to delete, matched exactly (the id of a connector server is its name). If it is left out, all connector servers are deleted.',
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
        'Do not ask for confirmation before deleting all connector servers, or before deleting a connector server with --force. Required without a terminal.'
      )
    )
    .addOption(
      new Option(
        '--force',
        'Delete the connector server with -i although server clusters or connectors still name it. The connector server is removed from the server clusters that list it, in the same single write that deletes it, and the configuration is read again to check it. Every connector that names it is left alone, it names a connector server that does not exist afterwards. What was changed and what was left is printed. Only with -i.'
      )
    )
    .addOption(
      new Option(
        '--keep-links',
        'With --force: leave the name of the connector server in the server clusters that list it. Only with -i and --force.'
      )
    )
    .addHelpText(
      'after',
      `Without --force, a connector server that a server cluster lists or that a connector uses as its host is not deleted, the command says which and exits with code 1. --allow-failures keeps the exit code at 0 for a write that failed, but never for a refusal, a connector server that does not exist, or a configuration that changed while it was being deleted or did not read back as it was written. An empty answer is not proof that a connector server is unused: the connector server process itself, an OAuth2 client that the platform keeps for it, and a connector server name inside a script are not seen.\n` +
        `Deleting all connector servers does not change any server cluster and does not refuse: a server cluster that lists a deleted connector server lists a name that does not exist afterwards. The plan that -d prints, and that a terminal sees before the question, lists what names them. Each connector server is deleted by its own write, built from the list that was read at the start and not checked afterwards: unlike a named delete, a change that someone else makes to the configuration meanwhile can be overwritten.\n` +
        `Usage Examples:\n` +
        `  Preview the deletion of all connector servers and of what names them:\n` +
        c.command(
          `  $ frodo config-manager delete connector-servers -d ${s.connId}\n`
        ) +
        `  Delete a connector server (refused if a server cluster or a connector still names it):\n` +
        c.command(
          `  $ frodo config-manager delete connector-servers -i rcs ${s.connId}\n`
        ) +
        `  Preview the deletion of a connector server and of what names it:\n` +
        c.command(
          `  $ frodo config-manager delete connector-servers -i rcs -d ${s.connId}\n`
        ) +
        `  Delete a connector server that is named, and remove it from the server clusters, without asking:\n` +
        c.command(
          `  $ frodo config-manager delete connector-servers -i rcs --force -y ${s.connId}\n`
        ) +
        `  Delete it the same way and leave the server clusters as they are:\n` +
        c.command(
          `  $ frodo config-manager delete connector-servers -i rcs --force --keep-links -y ${s.connId}\n`
        ) +
        `  Delete all connector servers without prompting:\n` +
        c.command(
          `  $ frodo config-manager delete connector-servers -y ${s.connId}\n`
        )
    )
    .multiOp()
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      const named = options.serverId !== undefined;
      if (named && options.serverId.trim() === '') {
        printMessage(
          'The connector server id (-i) must not be empty. To delete all connector servers, leave out -i.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      if (!named && (options.force || options.keepLinks)) {
        printMessage(
          `${options.force ? '--force' : '--keep-links'} applies to a named connector server only: add -i/--server-id, or leave it out.`,
          'error'
        );
        process.exitCode = 1;
        return;
      }
      if (options.keepLinks && !options.force) {
        printMessage(
          '--keep-links applies together with --force only: without --force a connector server that a server cluster lists is not deleted.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      // a delete of all connector servers, and a forced delete that changes the
      // server clusters that list the connector server, are asked about, as for
      // a command that can change more than the one object it names
      // (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md);
      // a run that nobody can be asked about is refused before the login
      const guardOptions = {
        what: named
          ? `delete connector server '${options.serverId}'${options.keepLinks ? ' although server clusters and connectors still name it' : ' and change the server clusters that list it'}`
          : 'all connector servers',
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
      if (!(await getTokens(false, true, deploymentTypes))) {
        process.exitCode = 1;
        return;
      }
      const showPlan = () =>
        configManagerDeleteRemoteServers(options.serverId, true, false, {
          force: options.force,
          keepLinks: options.keepLinks,
          plan: true,
        });
      if (!named && !(await confirmBulkDelete({ ...guardOptions, showPlan }))) {
        process.exitCode = 1;
        return;
      }
      if (
        named &&
        options.force &&
        !(await confirmProceed({
          ...guardOptions,
          // the plan above says what is changed: the question only points to it
          what: `delete connector server '${options.serverId}' as planned above`,
          warning: `Connector server '${options.serverId}' is deleted and every change listed above is made. This cannot be undone.`,
          showPlan,
        }))
      ) {
        process.exitCode = 1;
        return;
      }
      verboseMessage(
        named
          ? `Deleting connector server '${options.serverId}'.`
          : 'Deleting connector servers.'
      );
      const outcome = await configManagerDeleteRemoteServers(
        options.serverId,
        options.dryRun,
        options.allowFailures,
        { force: options.force, keepLinks: options.keepLinks }
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
