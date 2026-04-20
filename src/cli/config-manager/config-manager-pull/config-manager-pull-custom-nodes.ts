import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { configManagerExportCustomNodes } from '../../../configManagerOps/FrConfigCustomNodesOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull custom-nodes',
    [],
    deploymentTypes
  );

  program
    .description('Export custom nodes.')
    .addOption(
      new Option(
        '-n, --node-name <node-name>',
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

      if (await getTokens(false, true, deploymentTypes)) {
        if (options.nodeName) {
          verboseMessage(
            `Fetching custom node with name '${options.nodeName}'`
          );
        } else {
          verboseMessage('Fetching custom nodes');
        }
        const outcome = await configManagerExportCustomNodes(options.nodeName);
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    });

  return program;
}
