import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { deleteAIAgent, deleteAIAgents } from '../../ops/AgentOps';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

/**
 * @param legacy true for `frodo agent ai`, the deprecated path, which stays exactly as it was in 4.x
 * (cli#1271): no usage examples, and the original options of the commands
 */
export default function setup(legacy = false) {
  const program = new FrodoCommand('frodo aiagent delete');

  program
    .description('Delete AI agents.')
    .addOption(
      new Option(
        '-i, --agent-id <agent-id>',
        'Agent id. Cannot be used with -a.'
      ).conflicts(['all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all AI agents. Cannot be used with -i.'
      ).conflicts(['agentId'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all AI agents. Required with -a when there is no terminal.'
      )
    )
    .requireOneOf({ options: ['agentId', 'all'], purpose: 'what to delete' })
    .multiOp()
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
        // a run that nobody can be asked about is refused before the login
        // (cli record 0037)
        if (
          options.all &&
          !checkBulkDelete({
            what: 'all AI agents',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        if (await getTokens()) {
          // delete by id
          if (options.agentId) {
            verboseMessage(
              `Deleting agent '${
                options.agentId
              }' in realm "${state.getRealm()}"...`
            );
            const outcome = await deleteAIAgent(options.agentId);
            if (!outcome) process.exitCode = 1;
          }
          // --all -a
          else if (options.all) {
            if (
              !(await confirmBulkDelete({
                what: 'all AI agents',
                yes: options.yes,
                dryRunAvailable: false,
              }))
            ) {
              process.exitCode = 1;
              return;
            }
            verboseMessage('Deleting all AI agents...');
            const outcome = await deleteAIAgents(options.allowFailures);
            if (!outcome) process.exitCode = 1;
          }
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
        `  Delete the AI agent '${s.aiAgentId}' and log in with AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo aiagent delete -i ${s.aiAgentId} ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Delete all AI agents of the realm without asking, using a connection profile:\n` +
        c.command(`  $ frodo aiagent delete -a -y ${s.connId}\n`)
    );
  }

  return program;
}
