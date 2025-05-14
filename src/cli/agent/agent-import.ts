import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  importAgentFromFile,
  importAgentsFromFile,
  importAgentsFromFiles,
  importFirstAgentFromFile,
} from '../../ops/AgentOps.js';
import { getTokens } from '../../ops/AuthenticateOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLASSIC_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const globalDeploymentTypes = [CLASSIC_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo agent import',
    [],
    globalDeploymentTypes
  );

  program
    .description('Import agents.')
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
        'Import all agents from separate files (*.agent.json) in the current directory. Ignored with -i or -a.'
      )
    )
    .addOption(new Option('-g, --global', 'Import global agents.'))
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
        if (
          await getTokens(
            false,
            true,
            options.global ? globalDeploymentTypes : undefined
          )
        ) {
          // import
          if (options.agentId && options.file) {
            verboseMessage(`Importing agent ${options.agentId}...`);
            const outcome = await importAgentFromFile(
              options.agentId,
              options.file,
              options.global
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all -a
          else if (options.all && options.file) {
            verboseMessage(
              `Importing all agents from a single file (${options.file})...`
            );
            const outcome = await importAgentsFromFile(
              options.file,
              options.global
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all-separate -A
          else if (options.allSeparate && !options.file) {
            verboseMessage('Importing all agents from separate files...');
            const outcome = await importAgentsFromFiles(options.global);
            if (!outcome) process.exitCode = 1;
          }
          // import first agent in file
          else if (options.file) {
            verboseMessage('Importing first agent in file...');
            const outcome = await importFirstAgentFromFile(
              options.file,
              options.global
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
