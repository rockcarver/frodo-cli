import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { deleteJavaAgent, deleteJavaAgents } from '../../ops/AgentOps';
import { getTokens } from '../../ops/AuthenticateOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
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
    .requireOneOf({ options: ['agentId', 'all'], purpose: 'what to delete' })
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
            const outcome = await deleteJavaAgent(options.agentId);
            if (!outcome) process.exitCode = 1;
          }
          // --all -a
          else if (options.all) {
            verboseMessage('Deleting all agents...');
            const outcome = await deleteJavaAgents();
            if (!outcome) process.exitCode = 1;
          }
        }
        // No branch ran: with requireOneOf satisfied, the only way
        // here is getTokens() failing -- keep the old exit-1 semantics
        // (the removed else handled auth failure too).
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
