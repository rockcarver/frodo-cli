import { Option } from 'commander';

import { configManagerExportCustomNodes } from '../../../configManagerOps/FrConfigCustomNodesOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull custom-nodes');

  program
    .description('Export custom nodes.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Custom node display name. If specified, only one custom node is exported.'
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

      const getTokensIsSuccessful = await getTokens();
      if (!getTokensIsSuccessful) process.exit(1);
      verboseMessage(
        `Exporting custom node${options.name ? ` with name ${options.name}` : 's'}`
      );
      const outcome = await configManagerExportCustomNodes(options.name);
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
