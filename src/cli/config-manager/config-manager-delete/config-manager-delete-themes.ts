import { frodo } from '@rockcarver/frodo-lib';
import { configManagerDeleteThemes } from '../../../configManagerOps/FrConfigThemeOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
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
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Delete all themes in the selected realms:\n` +
        c.command(`  $ frodo config-manager delete themes ${s.connId}\n`) +
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

      if (!(await getTokens(false, true, deploymentTypes))) {
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
