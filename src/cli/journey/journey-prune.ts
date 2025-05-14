import { frodo, state } from '@rockcarver/frodo-lib';
import yesno from 'yesno';

import { getTokens } from '../../ops/AuthenticateOps';
import { printError, printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { findOrphanedNodes, removeOrphanedNodes } = frodo.authn.node;

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo journey prune', [], deploymentTypes);

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
        if (await getTokens(false, true, deploymentTypes)) {
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
            printError(error);
            process.exitCode = 1;
          }
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
