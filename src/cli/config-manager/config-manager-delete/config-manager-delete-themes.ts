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
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete themes',
    [],
    deploymentTypes
  );
  program
    .description(
      'Delete themes by name or delete all themes in the selected realms.'
    )
    .option('-n, --name <name>', 'Name of the theme to delete.')
    .option('-d, --dry-run', 'Show which themes would be deleted.')
    .option(
      '-y, --yes',
      'Do not ask for confirmation before deleting more than one theme (no -n). Required without a terminal.'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all themes in the selected realms without asking, which is required without a terminal (without -y a terminal is asked first):\n` +
        c.command(`  $ frodo config-manager delete themes -y ${s.connId}\n`) +
        `  Preview the deletion of all themes in the selected realms:\n` +
        c.command(`  $ frodo config-manager delete themes -d ${s.connId}\n`) +
        `  Delete a theme by name:\n` +
        c.command(
          `  $ frodo config-manager delete themes -n 'Example Theme' ${s.connId}\n`
        ) +
        `  Preview deletion of a theme by name:\n` +
        c.command(
          `  $ frodo config-manager delete themes -n 'Example Theme' -d ${s.connId}\n`
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

      // a run that nobody can be asked about is refused before the login
      const what = 'all themes in the selected realms';
      if (
        !options.name &&
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
        !options.name &&
        !(await confirmBulkDelete({
          what,
          yes: options.yes,
          dryRun: options.dryRun,
          showPlan: () => configManagerDeleteThemes(undefined, realm, true),
        }))
      ) {
        process.exitCode = 1;
        return;
      }

      verboseMessage('Deleting themes');
      const outcome = await configManagerDeleteThemes(
        options.name,
        realm,
        options.dryRun
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
