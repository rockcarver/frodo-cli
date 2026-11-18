import { Option } from 'commander';
import { configManagerExportCustomNodes } from '../../../configManagerOps/FrConfigCustomNodesOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { withOptionAlias } from '../../OptionAlias';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull custom-nodes');

  program
    .description('Export custom nodes.')
    .addOption(
      new Option(
        '-i, --node-id <id>',
        'Custom node id. If specified, only the custom node with that id is exported. Cannot be used with -n.'
      ).conflicts(['nodeName'])
    )
    .addOption(
      withOptionAlias(
        new Option(
          '-n, --node-name <name>',
          'Custom node display name. If specified, only one custom node is exported. Cannot be used with -i.'
        ).conflicts(['nodeId']),
        ['--name']
      )
    )
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

      const getTokensIsSuccessful = await getTokens();
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }
      verboseMessage(
        options.nodeId !== undefined
          ? `Exporting custom node with id ${options.nodeId}`
          : `Exporting custom node${options.nodeName ? ` with name ${options.nodeName}` : 's'}`
      );
      const outcome = await configManagerExportCustomNodes(
        options.nodeName,
        options.allowFailures,
        options.nodeId
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
