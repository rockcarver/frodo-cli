import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, Agent, state } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { deleteIdentityGatewayAgent, deleteIdentityGatewayAgents } = Agent;

const program = new FrodoCommand('frodo agent gateway delete');

program
  .description('Delete identity gateway agents.')
  .addOption(
    new Option(
      '-i, --agent-id <agent-id>',
      'Agent id. If specified, -a is ignored.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Delete all identity gateway agents. Ignored with -i.'
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
        // delete by id
        if (options.agentId) {
          verboseMessage(
            `Deleting agent '${
              options.agentId
            }' in realm "${state.getRealm()}"...`
          );
          try {
            await deleteIdentityGatewayAgent(options.agentId);
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
            await deleteIdentityGatewayAgents();
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
