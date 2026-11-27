import { frodo } from '@rockcarver/frodo-lib';
import { configManagerDeleteThemes } from '../../../configManagerOps/FrConfigThemeOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config delete themes',
    [],
    deploymentTypes
  );
  program
    .description(
      'Delete themes by id or by name, or delete all themes in the selected realms.'
    )
    .addOption(
      selectorOption(
        '-i, --theme-id <id>',
        'Id of the theme to delete. Cannot be used with -n.'
      ).conflicts(['themeName'])
    )
    .addOption(
      selectorOption(
        '-n, --theme-name <name>',
        'Name of the theme to delete. Cannot be used with -i.',
        ['--name']
      ).conflicts(['themeId'])
    )
    .option('-d, --dry-run', 'Show which themes would be deleted.')
    .option(
      '-y, --yes',
      'Do not ask for confirmation before deleting more than one theme (no -i or -n). Required without a terminal.'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all themes in the selected realms without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(`  $ frodo config delete themes -y ${s.connId}\n`) +
        `  Preview the deletion of all themes in the selected realms:\n` +
        c.command(`  $ frodo config delete themes -d ${s.connId}\n`) +
        `  Delete a theme by name:\n` +
        c.command(
          `  $ frodo config delete themes -n 'Example Theme' ${s.connId}\n`
        ) +
        `  Preview deletion of a theme by name:\n` +
        c.command(
          `  $ frodo config delete themes -n 'Example Theme' -d ${s.connId}\n`
        ) +
        `  Delete a theme by id:\n` +
        c.command(
          `  $ frodo config delete themes -i a7f3c0de-2b41-4c1e-8d52-6e9b4a1c7f30 ${s.connId}\n`
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

      // a single theme (by id or by name) is deleted without a question, as for
      // a command that can delete more than the one object it names (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md); a run
      // that nobody can be asked about is refused before the login
      const named =
        options.themeId !== undefined || options.themeName !== undefined;
      const what = 'all themes in the selected realms';
      if (
        !named &&
        !checkBulkDelete({ what, yes: options.yes, dryRun: options.dryRun })
      ) {
        process.exitCode = 1;
        return;
      }
      if (!(await getTokens(false, true, deploymentTypes))) {
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
            configManagerDeleteThemes(
              undefined,
              realmOfRun(command, realm),
              true
            ),
        }))
      ) {
        process.exitCode = 1;
        return;
      }

      verboseMessage('Deleting themes');
      const outcome = await configManagerDeleteThemes(
        options.themeName,
        realmOfRun(command, realm),
        options.dryRun,
        options.allowFailures,
        options.themeId
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
