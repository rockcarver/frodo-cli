import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  importFirstIdentityGatewayAgentFromFile,
  importIdentityGatewayAgentFromFile,
  importIdentityGatewayAgentsFromFile,
  importIdentityGatewayAgentsFromFiles,
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
    'frodo agent gateway import',
    [],
    deploymentTypes
  );

  program
    .description('Import gateway agents.')
    .addOption(
      new Option(
        '-i, --agent-id <agent-id>',
        'Agent id. If specified, only one agent is imported and the options -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
    .addOption(
      new Option(
        '-a, --all',
        'Import all agents from single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all agents from separate files (*.identitygatewayagent.json) in the current directory. Ignored with -i or -a.'
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
          // import
          if (options.agentId) {
            verboseMessage(
              `Importing web agent ${options.agentId} from file...`
            );
            const outcome = await importIdentityGatewayAgentFromFile(
              options.agentId,
              options.file
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all -a
          else if (options.all && options.file) {
            verboseMessage(
              `Importing all web agents from a single file (${options.file})...`
            );
            const outcome = await importIdentityGatewayAgentsFromFile(
              options.file
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all-separate -A
          else if (options.allSeparate && !options.file) {
            verboseMessage('Importing all web agents from separate files...');
            const outcome = await importIdentityGatewayAgentsFromFiles();
            if (!outcome) process.exitCode = 1;
          }
          // import first journey in file
          else if (options.file) {
            verboseMessage('Importing first web agent in file...');
            const outcome = await importFirstIdentityGatewayAgentFromFile(
              options.file
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
