import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  exportIdentityGatewayAgentsToFile,
  exportIdentityGatewayAgentsToFiles,
  exportIdentityGatewayAgentToFile,
} from '../../ops/AgentOps.js';
import { getTokens } from '../../ops/AuthenticateOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
];
export default function setup() {
  const program = new FrodoCommand(
    'frodo agent gateway export',
    [],
    deploymentTypes
  );

  program
    .description('Export gateway agents.')
    .addOption(
      new Option(
        '-i, --agent-id <agent-id>',
        'Agent id. If specified, -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
    .addOption(
      new Option(
        '-a, --all',
        'Export all gateway agents to a single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all gateway agents to separate files (*.identitygatewayagent.json) in the current directory. Ignored with -i or -a.'
      )
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .action(
      // implement command logic inside action handler
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        if (await getTokens(false, true, deploymentTypes)) {
          // export
          if (options.agentId) {
            verboseMessage('Exporting identity gateway agent...');
            const outcome = await exportIdentityGatewayAgentToFile(
              options.agentId,
              options.file,
              options.metadata
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all -a
          else if (options.all) {
            verboseMessage(
              'Exporting all identity gateway agents to a single file...'
            );
            const outcome = await exportIdentityGatewayAgentsToFile(
              options.file,
              options.metadata
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all-separate -A
          else if (options.allSeparate) {
            verboseMessage(
              'Exporting all identity gateway agents to separate files...'
            );
            const outcome = await exportIdentityGatewayAgentsToFiles(
              options.metadata
            );
            if (!outcome) process.exitCode = 1;
          }
          // unrecognized combination of options or no options
          else {
            verboseMessage(
              'Unrecognized combination of options or no options...'
            );
            program.help();
            process.exitCode = 1;
          }
        }
      }
      // end command logic inside action handler
    );

  return program;
}
