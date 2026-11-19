import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { listAIAgents } from '../../ops/AgentOps.js';
import { getTokens } from '../../ops/AuthenticateOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

/**
 * @param legacy true for `frodo agent ai`, the deprecated path, which stays exactly as it was in 4.x
 * (cli#1271): no usage examples, and the original options of the commands
 */
export default function setup(legacy = false) {
  const program = new FrodoCommand('frodo aiagent list');

  program
    .description('List AI agents.')
    .addOption(
      new Option('-l, --long', 'Long with all fields.').default(false, 'false')
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
          const outcome = await listAIAgents(options.long);
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
        `  List the id of every AI agent of the realm and log in with AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo aiagent list ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  List them with their status using a connection profile:\n` +
        c.command(`  $ frodo aiagent list --long ${s.connId}\n`)
    );
  }

  return program;
}
