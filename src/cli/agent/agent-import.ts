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

const { CLASSIC_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;
const globalDeploymentTypes = [
  CLASSIC_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo agent import');

  program
    .description('Import agents.')
    .addOption(
      new Option(
        '-i, --agent-id <agent-id>',
        'Agent id. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the file to import. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all agents from single file. Cannot be used with -i or -A.'
      ).conflicts(['agentId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all agents from separate files (*.agent.json) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['agentId', 'file', 'all'])
    )
    .addOption(new Option('-g, --global', 'Import global agents.'))
    .requireOneOf({
      options: ['agentId', 'all', 'allSeparate', 'file', 'global'],
      purpose: 'what to import',
    })
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
            process.exitCode = 1;
            program.help();
          }
        }
      }
      // end command logic inside action handler
    );

  return program;
}
