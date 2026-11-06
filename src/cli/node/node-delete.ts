import { frodo, type CustomNodeSkeleton } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteCustomNode, deleteCustomNodes } from '../../ops/NodeOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import { verboseMessage } from '../../utils/Console';
import {
  deferEntityPicks,
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
        'Custom node id or service name. Cannot be used with -n or -a.'
      ).conflicts(['nodeName', 'all'])
    )
    .addOption(
      new Option(
        '-n, --node-name <node-name>',
        'Custom node display name. Cannot be used with -i or -a.'
      ).conflicts(['nodeId', 'all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all custom nodes. Cannot be used with -i or -n.'
      ).conflicts(['nodeId', 'nodeName'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all custom nodes. Required with -a when there is no terminal.'
      )
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
      // a run that nobody can be asked about is refused before the login
      // (cli record 0037)
      if (
        options.all &&
        !checkBulkDelete({
          what: 'all custom nodes',
          yes: options.yes,
          dryRunAvailable: false,
        })
      ) {
        process.exitCode = 1;
        return;
      }
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
      // in the pre-picker layout, where the error branch below handled that case).
      else if (
        (options.all || (await resolveEntityPicks(command))) &&
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
          if (
            !(await confirmBulkDelete({
              what: 'all custom nodes',
              yes: options.yes,
              dryRunAvailable: false,
            }))
          ) {
            process.exitCode = 1;
            return;
          }
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

  deferEntityPicks(program, [
    entityPick<CustomNodeSkeleton>({
      name: 'nodeId',
      kind: 'custom node',
      load: () => frodo.authn.node.readCustomNodes(),
      label: (node) => node.displayName || node._id || '',
      description: (node) => node.description,
    }),
  ]);

  return program;
}
