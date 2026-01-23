import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { describeCustomNode } from '../../ops/NodeOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo node describe');

  program
    .description('Describe custom nodes.')
    .addOption(
      new Option('-i, --node-id <node-id>', 'Custom node id or service name.')
    )
    .addOption(
      new Option('-n, --node-name <node-name>', 'Custom node display name.')
    )
    .addOption(new Option('--json', 'Output in JSON format.'))
    .action(async (host, realm, user, password, options, command) => {
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
          `Describing custom node ${options.nodeName ? options.nodeName : options.nodeId}...`
        );
        const outcome = await describeCustomNode(
          options.nodeId,
          options.nodeName,
          options.json
        );
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
