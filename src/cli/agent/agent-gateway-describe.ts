import { Option } from 'commander';
import { describeIdentityGatewayAgent } from '../../ops/AgentOps.js';
import { getTokens } from '../../ops/AuthenticateOps';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo agent gateway describe');

  program
    .description('Describe gateway agents.')
    .addOption(new Option('-i, --agent-id <agent-id>', 'Agent id.'))
    .addOption(new Option('--json', 'Output in JSON format.'))
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
          const outcome = await describeIdentityGatewayAgent(
            options.agentId,
            options.json
          );
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
