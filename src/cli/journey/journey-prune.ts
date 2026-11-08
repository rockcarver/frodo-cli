import confirm from '@inquirer/confirm';
import { state } from '@rockcarver/frodo-lib';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { pruneOrphanedNodes } from '../../ops/JourneyOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo journey prune');

  program
    .description(
      'Prune orphaned configuration artifacts left behind after deleting authentication trees. You will be prompted before any destructive operations are performed.'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Find and interactively confirm removal of orphaned nodes using a connection profile:\n` +
        c.command(`  $ frodo journey prune ${s.connId}\n`) +
        `  Find orphaned nodes and log in with AM base URL, username, and password:\n` +
        c.command(
          `  $ frodo journey prune ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        )
    )
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
        if (await getTokens()) {
          verboseMessage(
            `Pruning orphaned configuration artifacts in realm "${state.getRealm()}"...`
          );
          const outcome = await pruneOrphanedNodes(
            () =>
              confirm({
                message: 'Prune (permanently delete) orphaned nodes?',
                default: false,
              }),
            options.allowFailures
          );
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
