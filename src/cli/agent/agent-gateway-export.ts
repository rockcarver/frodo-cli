import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';
import {
  exportIdentityGatewayAgentsToFile,
  exportIdentityGatewayAgentsToFiles,
  exportIdentityGatewayAgentToFile,
} from '../../ops/AgentOps.js';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo agent gateway export');

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
        // export
        if (options.agentId) {
          verboseMessage('Exporting identity gateway agent...');
          await exportIdentityGatewayAgentToFile(options.agentId, options.file);
        }
        // --all -a
        else if (options.all) {
          verboseMessage(
            'Exporting all identity gateway agents to a single file...'
          );
          await exportIdentityGatewayAgentsToFile(options.file);
        }
        // --all-separate -A
        else if (options.allSeparate) {
          verboseMessage(
            'Exporting all identity gateway agents to separate files...'
          );
          await exportIdentityGatewayAgentsToFiles();
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
