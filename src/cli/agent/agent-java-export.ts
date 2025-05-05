import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  exportJavaAgentsToFile,
  exportJavaAgentsToFiles,
  exportJavaAgentToFile,
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
    'frodo agent java export',
    [],
    deploymentTypes
  );

  program
    .description('Export java agents.')
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
        'Export all java agents to a single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all java agents to separate files (*.javaagent.json) in the current directory. Ignored with -i or -a.'
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
            verboseMessage('Exporting java agent...');
            const outcome = await exportJavaAgentToFile(
              options.agentId,
              options.file,
              options.metadata
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all -a
          else if (options.all) {
            verboseMessage('Exporting all java agents to a single file...');
            const outcome = await exportJavaAgentsToFile(
              options.file,
              options.metadata
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all-separate -A
          else if (options.allSeparate) {
            verboseMessage('Exporting all java agents to separate files...');
            const outcome = await exportJavaAgentsToFiles(options.metadata);
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
