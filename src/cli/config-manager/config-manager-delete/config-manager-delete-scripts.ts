import { Option } from 'commander';
import { configManagerDeleteScripts } from '../../../configManagerOps/FrConfigScriptOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand, ListOption } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager delete scripts');

  program
    .description('Delete AM scripts. Default scripts are never deleted.')
    .addOption(
      new Option('-n, --name <name>', 'Delete a specific script by name.')
    )
    .addOption(
      new ListOption(
        '-p, --prefix <prefix>',
        'Delete all eligible scripts that start with a prefix. Repetition of this flag is allowed. Ignored with -n'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which scripts would be deleted without deleting them.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all eligible scripts:\n` +
        c.command(`  $ frodo config-manager delete scripts ${s.connId}\n`) +
        `  Delete a script by name:\n` +
        c.command(
          `  $ frodo config-manager delete scripts -n 'Example Script' ${s.connId}\n`
        ) +
        `  Preview deletion of a script without deleting it:\n` +
        c.command(
          `  $ frodo config-manager delete scripts -n 'Example Script' -d ${s.connId}\n`
        )
    )
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      const getTokensIsSuccessful = await getTokens();
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }

      verboseMessage(
        options.name ? `Deleting script "${options.name}".` : 'Deleting scripts'
      );
      const outcome = await configManagerDeleteScripts(
        options.prefix,
        realm,
        options.name,
        options.dryRun
      );

      if (!outcome) process.exitCode = 1;
    });

  return program;
}
