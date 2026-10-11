import { frodo, type CustomNodeSkeleton } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteCustomNode, deleteCustomNodes } from '../../ops/NodeOps';
import { verboseMessage } from '../../utils/Console';
import {
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo node delete');

  program
    .description('Delete custom nodes.')
    .addOption(
      new Option(
        '-i, --node-id <node-id>',
        'Custom node id or service name. If specified, only one custom node is deleted and the options -n, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-n, --node-name <node-name>',
        'Custom node display name. If specified, only one custom node is deleted and the options -a and -A are ignored.'
      )
    )
    .addOption(
      new Option('-a, --all', 'Delete all custom nodes. Ignored with -i or -n.')
    )
    .requireOneOf({
      options: ['all', 'nodeId', 'nodeName'],
      purpose: 'what to delete',
    })
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      if ((options.nodeId || options.nodeName) && (await getTokens())) {
        verboseMessage(
          `Deleting custom node ${options.nodeName ? options.nodeName : options.nodeId}...`
        );
        const outcome = await deleteCustomNode(
          options.nodeId,
          options.nodeName
        );
        if (!outcome) process.exitCode = 1;
      }
      // --all -a, or an interactive pick (resolveEntityPicks is a no-op
      // outside the prompt gate, so a non-interactive run with neither
      // option never reaches deleteCustomNodes here -- same as before
      // Phase 3, where the error branch below handled that case).
      else if (
        (options.all ||
          (await resolveEntityPicks(command, [
            entityPick<CustomNodeSkeleton>({
              name: 'nodeId',
              kind: 'custom node',
              load: () => frodo.authn.node.readCustomNodes(),
              label: (node) => node.displayName || node._id || '',
              description: (node) => node.description,
            }),
          ]))) &&
        (await getTokens())
      ) {
        if (options.nodeId || options.nodeName) {
          verboseMessage(
            `Deleting custom node ${options.nodeName ? options.nodeName : options.nodeId}...`
          );
          const outcome = await deleteCustomNode(
            options.nodeId,
            options.nodeName
          );
          if (!outcome) process.exitCode = 1;
        } else {
          verboseMessage(`Deleting all custom nodes...`);
          const outcome = await deleteCustomNodes();
          if (!outcome) process.exitCode = 1;
        }
      } else {
        // No branch ran: with requireOneOf satisfied, the only ways here
        // are getTokens() failing (keep the old exit-1 semantics) or the
        // user escaping the entity picker (declined to run).
        process.exitCode = 1;
      }
    });

  return program;
}
