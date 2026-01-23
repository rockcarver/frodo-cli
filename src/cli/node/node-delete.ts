import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { deleteCustomNode, deleteCustomNodes } from '../../ops/NodeOps';
import { printMessage, verboseMessage } from '../../utils/Console';
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
      } else if (options.all && (await getTokens())) {
        verboseMessage(`Deleting all custom nodes...`);
        const outcome = await deleteCustomNodes();
        if (!outcome) process.exitCode = 1;
      } else {
        printMessage(
          'Unrecognized combination of options or no options...',
          'error'
        );
        program.help();
        process.exitCode = 1;
      }
    });

  return program;
}
