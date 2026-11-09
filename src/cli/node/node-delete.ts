import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteCustomNode, deleteCustomNodes } from '../../ops/NodeOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import { printMessage, verboseMessage } from '../../utils/Console';
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
      // On a terminal the framework offers a custom node to pick, after the
      // login, when -i and -n were both left out (cli record 0038). A failed
      // login, a declined pick and a failed read all stop here.
      if (!(await getTokens())) {
        process.exitCode = 1;
        return;
      }
      if (options.nodeId || options.nodeName) {
        verboseMessage(
          `Deleting custom node ${options.nodeName ? options.nodeName : options.nodeId}...`
        );
        const outcome = await deleteCustomNode(
          options.nodeId,
          options.nodeName
        );
        if (!outcome) process.exitCode = 1;
      } else if (options.all) {
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
        const outcome = await deleteCustomNodes(options.allowFailures);
        if (!outcome) process.exitCode = 1;
      } else {
        // an empty list leaves nothing to pick from
        printMessage('No custom nodes found to delete.');
      }
    });

  return program;
}
