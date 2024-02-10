import { frodo, state } from '@rockcarver/frodo-lib';
import yesno from 'yesno';

import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { findOrphanedNodes, removeOrphanedNodes } = frodo.authn.node;

const program = new FrodoCommand('frodo journey prune');

program
  .description(
    'Prune orphaned configuration artifacts left behind after deleting authentication trees. You will be prompted before any destructive operations are performed.'
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
      if (await getTokens()) {
        verboseMessage(
          `Pruning orphaned configuration artifacts in realm "${state.getRealm()}"...`
        );
        try {
          const orphanedNodes = await findOrphanedNodes();
          if (orphanedNodes.length > 0) {
            const ok = await yesno({
              question: 'Prune (permanently delete) orphaned nodes? (y|n):',
            });
            if (ok) {
              await removeOrphanedNodes(orphanedNodes);
            }
          } else {
            printMessage('No orphaned nodes found.');
          }
        } catch (error) {
          printMessage(
            `Error pruning orphaned nodes: ${error.message}`,
            'error'
          );
        }
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
