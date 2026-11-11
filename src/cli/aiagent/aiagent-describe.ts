import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { describeAIAgent } from '../../ops/AgentOps.js';
import { getTokens } from '../../ops/AuthenticateOps';
import c from '../../utils/ColorTheme';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo aiagent describe');

  program
    .description('Describe AI agents.')
    .addOption(new Option('-i, --agent-id <agent-id>', 'Agent id.'))
    .addOption(new Option('--json', 'Output in JSON format.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Describe the AI agent '${s.aiAgentId}' and log in with AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo aiagent describe -i ${s.aiAgentId} ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Print the whole AI agent in JSON format using a connection profile:\n` +
        c.command(
          `  $ frodo aiagent describe -i ${s.aiAgentId} --json ${s.connId}\n`
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
          const description = await describeAIAgent(
            options.agentId,
            options.json
          );
          printMessage(description, 'data');
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
