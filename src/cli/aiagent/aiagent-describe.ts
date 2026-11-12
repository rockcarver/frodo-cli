import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { describeAIAgent } from '../../ops/AgentOps.js';
import { getTokens } from '../../ops/AuthenticateOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

/**
 * @param legacy true for `frodo agent ai`, the deprecated path, which stays exactly as it was in 4.x
 * (cli#1271): no usage examples, and the original options of the commands
 */
export default function setup(legacy = false) {
  const program = new FrodoCommand('frodo aiagent describe');

  program
    .description('Describe AI agents.')
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
          const outcome = await describeAIAgent(options.agentId, options.json);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  // the deprecated path has none, as it never had
  if (!legacy) {
    program.addHelpText(
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
    );
  }

  return program;
}
