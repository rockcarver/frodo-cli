import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';
import {
  importFirstJavaAgentFromFile,
  importJavaAgentFromFile,
  importJavaAgentsFromFile,
  importJavaAgentsFromFiles,
} from '../../ops/AgentOps.js';

const { getTokens } = Authenticate;

const program = new FrodoCommand('frodo agent java import');

program
  .description('Import java agents.')
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
      'Import all agents from separate files (*.javaagent.json) in the current directory. Ignored with -i or -a.'
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
      if (await getTokens()) {
        // import
        if (options.agentId) {
          verboseMessage(`Importing web agent ${options.agentId} from file...`);
          await importJavaAgentFromFile(options.agentId, options.file);
        }
        // --all -a
        else if (options.all && options.file) {
          verboseMessage(
            `Importing all web agents from a single file (${options.file})...`
          );
          await importJavaAgentsFromFile(options.file);
        }
        // --all-separate -A
        else if (options.allSeparate && !options.file) {
          verboseMessage('Importing all web agents from separate files...');
          await importJavaAgentsFromFiles();
        }
        // import first journey in file
        else if (options.file) {
          verboseMessage('Importing first web agent in file...');
          await importFirstJavaAgentFromFile(options.file);
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

program.parse();
