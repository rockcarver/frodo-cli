import { Option } from 'commander';
import * as s from '../../help/SampleData';
import {
  importAIAgentFromFile,
  importAIAgentsFromFile,
  importAIAgentsFromFiles,
  importFirstAIAgentFromFile,
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
  const program = new FrodoCommand('frodo aiagent import');

  program
    .description('Import AI agents.')
    .addOption(
      new Option(
        '-i, --agent-id <agent-id>',
        'Agent id. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the file to import. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all agents from single file. Cannot be used with -i or -A.'
      ).conflicts(['agentId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all agents from separate files (*.ai.agent.json) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['agentId', 'file', 'all'])
    )
    // frodo aiagent: -i and -a only narrow what -f reads, so they are no member
    // (an id that names an agent in a file gets no picker, record 0038), and the
    // command needs -f or -A. frodo agent ai is frozen: any of the four options
    // satisfies it, as in 4.x.
    .requireOneOf({
      options: legacy
        ? ['agentId', 'all', 'allSeparate', 'file']
        : ['file', 'allSeparate'],
      purpose: 'what to import',
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
          // import
          if (options.agentId) {
            verboseMessage(
              `Importing AI agent ${options.agentId} from file...`
            );
            const outcome = await importAIAgentFromFile(
              options.agentId,
              options.file
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all -a
          else if (options.all && options.file) {
            verboseMessage(
              `Importing all AI agents from a single file (${options.file})...`
            );
            const outcome = await importAIAgentsFromFile(
              options.file,
              options.allowFailures
            );
            if (!outcome) process.exitCode = 1;
          }
          // --all-separate -A
          else if (options.allSeparate && !options.file) {
            verboseMessage('Importing all AI agents from separate files...');
            const outcome = await importAIAgentsFromFiles(
              options.allowFailures
            );
            if (!outcome) process.exitCode = 1;
          }
          // import first agent in file
          else if (options.file) {
            verboseMessage('Importing first AI agent in file...');
            const outcome = await importFirstAIAgentFromFile(options.file);
            if (!outcome) process.exitCode = 1;
          }
          // unrecognized combination of options or no options
          else {
            verboseMessage(
              'Unrecognized combination of options or no options...'
            );
            process.exitCode = 1;
            program.help();
          }
        }
        // the login failed (cli#1094)
        else process.exitCode = 1;
      }
      // end command logic inside action handler
    );

  // the deprecated path has none, as it never had
  if (!legacy) {
    program.addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Import the AI agent '${s.aiAgentId}' from a file and log in with AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo aiagent import -i ${s.aiAgentId} -f ${s.aiAgentFile} ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Import the AI agent of a file that holds one, using a connection profile:\n` +
        c.command(
          `  $ frodo aiagent import -f ${s.aiAgentFile} ${s.connId}\n`
        ) +
        `  Import all AI agents from a single file:\n` +
        c.command(
          `  $ frodo aiagent import -a -f ${s.allAiAgentsFile} ${s.connId}\n`
        ) +
        `  Import all AI agents from separate files in the current directory:\n` +
        c.command(`  $ frodo aiagent import -A ${s.connId}\n`)
    );
  }

  return program;
}
