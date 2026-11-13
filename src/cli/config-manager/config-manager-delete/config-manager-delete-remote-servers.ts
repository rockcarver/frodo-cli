import { Option } from 'commander';
import { configManagerDeleteRemoteServers } from '../../../configManagerOps/FrConfigRemoteServersOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete remote-servers'
  );

  program
    .description(
      'Delete remote connector servers by name or delete all of them.'
    )
    .addOption(
      selectorOption(
        '-i, --remote-server-id <id>',
        'Remote server identifier, which is its exact name. If omitted, target all remote servers.',
        ['-n', '--name']
      )
    )
    .addOption(
      new Option('-d, --dry-run', 'Show which remote servers would be deleted.')
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Skip confirmation for bulk deletion. Required for bulk deletion without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Preview deletion of all remote servers:\n` +
        c.command(
          `  $ frodo config-manager delete remote-servers -d ${s.connId}\n`
        ) +
        `  Delete a remote server by identifier:\n` +
        c.command(
          `  $ frodo config-manager delete remote-servers -i rcs ${s.connId}\n`
        ) +
        `  Delete all remote servers without prompting:\n` +
        c.command(
          `  $ frodo config-manager delete remote-servers -y ${s.connId}\n`
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
      if (
        options.remoteServerId !== undefined &&
        options.remoteServerId.trim() === ''
      ) {
        printMessage(
          'The remote server id (-i) must not be empty. To delete all remote servers, leave out -i.',
          'error'
        );
        process.exitCode = 1;
        return;
      }
      const bulk = options.remoteServerId === undefined;
      const what = 'all remote servers';
      if (
        bulk &&
        !checkBulkDelete({ what, yes: options.yes, dryRun: options.dryRun })
      ) {
        process.exitCode = 1;
        return;
      }
      if (!(await getTokens(false, true))) {
        process.exitCode = 1;
        return;
      }
      if (
        bulk &&
        !(await confirmBulkDelete({
          what,
          yes: options.yes,
          dryRun: options.dryRun,
          showPlan: () => configManagerDeleteRemoteServers(undefined, true),
        }))
      ) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Deleting remote servers.');
      const outcome = await configManagerDeleteRemoteServers(
        options.remoteServerId,
        options.dryRun,
        options.allowFailures
      );

      if (!outcome) process.exitCode = 1;
    });

  return program;
}
