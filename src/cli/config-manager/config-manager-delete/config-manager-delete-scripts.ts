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
import { refuseEmptySelector, selectorOption } from '../../SelectorOption';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager delete scripts');

  program
    .description('Delete AM scripts. Default scripts are never deleted.')
    .addOption(
      selectorOption(
        '-i, --script-id <id>',
        'Delete a specific script by id. Cannot be used with -n or -p.'
      ).conflicts(['scriptName', 'prefix'])
    )
    .addOption(
      selectorOption(
        '-n, --script-name <name>',
        'Delete a specific script by name. Cannot be used with -i.',
        ['--name']
      ).conflicts(['scriptId'])
    )
    .addOption(
      new ListOption(
        '-p, --prefix <prefix>',
        'Delete all eligible scripts that start with a prefix. Repetition of this flag is allowed. An empty prefix is refused: it would match every script. Ignored with -n. Cannot be used with -i.'
      )
        // an empty variable must not mean all scripts, as for a selector
        .argParser((value: string, previous: string[] = []) => [
          ...previous,
          refuseEmptySelector(value),
        ])
        .conflicts(['scriptId'])
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
        'Do not ask for confirmation before deleting more than one script (no -i or -n). Required without a terminal.'
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
        ) +
        `  Delete a script by id:\n` +
        c.command(
          `  $ frodo config-manager delete scripts -i 6b0c0d73-8d3a-4c63-9c1f-3e0f6d5b2a10 ${s.connId}\n`
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

      // a prefix can match many scripts, so only a single script (by id or by
      // name) is deleted without a question, as for a command that can delete
      // more than the one object it names (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md); a run that nobody can be asked
      // about is refused before the login
      const named =
        options.scriptId !== undefined || options.scriptName !== undefined;
      const what = options.prefix?.length
        ? `all eligible scripts that start with ${options.prefix
            .map((prefix: string) => `"${prefix}"`)
            .join(' or ')}`
        : 'all eligible scripts';
      if (
        !named &&
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
        !named &&
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
        options.scriptId !== undefined
          ? `Deleting script with id "${options.scriptId}".`
          : options.scriptName !== undefined
            ? `Deleting script "${options.scriptName}".`
            : 'Deleting scripts'
      );
      const outcome = await configManagerDeleteScripts(
        options.prefix,
        realmOfRun(command, realm),
        options.scriptName,
        options.dryRun,
        options.allowFailures,
        options.scriptId
      );

      if (!outcome) process.exitCode = 1;
    });

  return program;
}
