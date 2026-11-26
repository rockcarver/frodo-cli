import { Option } from 'commander';
import { configManagerImportCustomNodes } from '../../../configManagerOps/FrConfigCustomNodesOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager push nodes', []);

  program
    .description('Import custom nodes.')
    .addOption(
      selectorOption(
        '-i, --node-id <id>',
        'Custom node id. If specified, only the custom node with that id is imported. Cannot be used with -n.'
      ).conflicts(['nodeName'])
    )
    .addOption(
      selectorOption(
        '-n, --node-name <name>',
        'Custom node display name. If specified, only the specified custom node is imported. Cannot be used with -i.',
        ['--name']
      ).conflicts(['nodeId'])
    )
    .addOption(
      new Option(
        '--filename-filter <filenameFilter>',
        'Combine multiple files using comma, use ~ prefix on entry for wildcard match'
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

      if (await getTokens()) {
        if (options.nodeId !== undefined) {
          verboseMessage(`Importing custom node with id '${options.nodeId}'`);
        } else if (options.nodeName) {
          verboseMessage(
            `Importing custom node with name '${options.nodeName}'`
          );
        } else {
          verboseMessage('Importing custom nodes');
        }
        const outcome = await configManagerImportCustomNodes(
          options.nodeName,
          options.filenameFilter,
          options.allowFailures,
          options.nodeId
        );
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    });

  return program;
}
