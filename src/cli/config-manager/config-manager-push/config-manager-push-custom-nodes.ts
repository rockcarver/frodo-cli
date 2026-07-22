import { Option } from 'commander';

import { configManagerImportCustomNodes } from '../../../configManagerOps/FrConfigCustomNodesOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push custom-nodes',
    []
  );

  program
    .description('Import custom nodes.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Custom node display name. If specified, only the specified custom node is imported.'
      )
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

      if (await getTokens()) {
        if (options.name) {
          verboseMessage(`Importing custom node with name '${options.name}'`);
        } else {
          verboseMessage('Importing custom nodes');
        }
        const outcome = await configManagerImportCustomNodes(options.name);
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    });

  return program;
}
