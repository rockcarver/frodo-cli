import { Option } from 'commander';
import { configManagerDeleteScripts } from '../../../configManagerOps/FrConfigScriptOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
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
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting more than one script (no -n). Required without a terminal.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all eligible scripts without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(`  $ frodo config-manager delete scripts -y ${s.connId}\n`) +
        `  Delete the scripts whose names start with a prefix:\n` +
        c.command(
          `  $ frodo config-manager delete scripts -p 'Example' -y ${s.connId}\n`
        ) +
        `  Preview the deletion of all eligible scripts:\n` +
        c.command(`  $ frodo config-manager delete scripts -d ${s.connId}\n`) +
        `  Delete a script by name:\n` +
        c.command(
          `  $ frodo config-manager delete scripts -n 'Example Script' ${s.connId}\n`
        ) +
        `  Preview deletion of a script without deleting it:\n` +
        c.command(
          `  $ frodo config-manager delete scripts -n 'Example Script' -d ${s.connId}\n`
        )
    )
    .multiOp()
    .usesRealm()
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      // a prefix can match many scripts, so only a single name is deleted
      // without a question (cli record 0037); a run that nobody can be asked
      // about is refused before the login
      const what = options.prefix?.length
        ? `all eligible scripts that start with ${options.prefix
            .map((prefix: string) => `"${prefix}"`)
            .join(' or ')}`
        : 'all eligible scripts';
      if (
        !options.name &&
        !checkBulkDelete({ what, yes: options.yes, dryRun: options.dryRun })
      ) {
        process.exitCode = 1;
        return;
      }
      const getTokensIsSuccessful = await getTokens();
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }

      if (
        !options.name &&
        !(await confirmBulkDelete({
          what,
          yes: options.yes,
          dryRun: options.dryRun,
          showPlan: () =>
            configManagerDeleteScripts(
              options.prefix,
              realmOfRun(command, realm),
              undefined,
              true
            ),
        }))
      ) {
        process.exitCode = 1;
        return;
      }

      verboseMessage(
        options.name ? `Deleting script "${options.name}".` : 'Deleting scripts'
      );
      const outcome = await configManagerDeleteScripts(
        options.prefix,
        realmOfRun(command, realm),
        options.name,
        options.dryRun,
        options.allowFailures
      );

      if (!outcome) process.exitCode = 1;
    });

  return program;
}
