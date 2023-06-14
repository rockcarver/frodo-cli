import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo, state } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console.js';

const program = new FrodoCommand('frodo agent java delete');

program
  .description('Delete java agents.')
  .addOption(
    new Option(
      '-i, --agent-id <agent-id>',
      'Agent id. If specified, -a is ignored.'
    )
  )
  .addOption(
    new Option('-a, --all', 'Delete all java agents. Ignored with -i.')
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
      if (await frodo.login.getTokens()) {
        // delete by id
        if (options.agentId) {
          verboseMessage(
            `Deleting agent '${
              options.agentId
            }' in realm "${state.getRealm()}"...`
          );
          try {
            await frodo.agent.deleteJavaAgent(options.agentId);
          } catch (error) {
            printMessage(error.message, 'error');
            process.exitCode = 1;
            return;
          }
        }
        // --all -a
        else if (options.all) {
          verboseMessage('Deleting all agents...');
          try {
            await frodo.agent.deleteJavaAgents();
          } catch (error) {
            printMessage(error.message, 'error');
            process.exitCode = 1;
            return;
          }
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
