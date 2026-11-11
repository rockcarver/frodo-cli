import { Option } from 'commander';
import * as s from '../../help/SampleData';
import {
  exportAIAgentsToFile,
  exportAIAgentsToFiles,
  exportAIAgentToFile,
} from '../../ops/AgentOps.js';
import { getTokens } from '../../ops/AuthenticateOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

/**
 * @param legacy true for `frodo agent ai`, the deprecated path, which stays exactly as it was in 4.x
 * (cli#1271): no usage examples, and the original options of the commands
 */
export default function setup(legacy = false) {
  const program = new FrodoCommand('frodo aiagent export');

  program
    .description('Export AI agents.')
    .addOption(
      new Option(
        '-i, --agent-id <agent-id>',
        'Agent id. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the export file. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all AI agents to a single file. Cannot be used with -i or -A.'
      ).conflicts(['agentId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all AI agents to separate files (*.aiagent.json) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['agentId', 'file', 'all'])
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .requireOneOf({
      options: ['agentId', 'all', 'allSeparate'],
      purpose: 'what to export',
    })
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
        if (await getTokens()) {
          // export
          if (options.agentId) {
            verboseMessage('Exporting AI agent...');
            const outcome = await exportAIAgentToFile(
              options.agentId,
              options.file,
              options.metadata
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all -a
          else if (options.all) {
            verboseMessage('Exporting all AI agents to a single file...');
            const outcome = await exportAIAgentsToFile(
              options.file,
              options.metadata
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all-separate -A
          else if (options.allSeparate) {
            verboseMessage('Exporting all AI agents to separate files...');
            const outcome = await exportAIAgentsToFiles(
              options.metadata,
              options.allowFailures
            );
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

  // the deprecated path has none, as it never had
  if (!legacy) {
    program.addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Export the AI agent '${s.aiAgentId}' to a file and log in with AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo aiagent export -i ${s.aiAgentId} ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Export the AI agent '${s.aiAgentId}' to a named file using a connection profile:\n` +
        c.command(
          `  $ frodo aiagent export -i ${s.aiAgentId} -f ${s.aiAgentFile} ${s.connId}\n`
        ) +
        `  Export all AI agents to a single file:\n` +
        c.command(`  $ frodo aiagent export -a ${s.connId}\n`) +
        `  Export all AI agents to separate files in the current directory:\n` +
        c.command(`  $ frodo aiagent export -A ${s.connId}\n`)
    );
  }

  return program;
}
