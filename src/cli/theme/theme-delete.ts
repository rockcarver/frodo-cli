import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteTheme,
  deleteThemeByName,
  deleteThemes,
} from '../../ops/ThemeOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo theme delete', [], deploymentTypes);

  program
    .description('Delete themes.')
    .addOption(
      new Option(
        '-i, --theme-id <uuid>',
        'Uuid of the theme. Cannot be used with -n or -a.'
      ).conflicts(['themeName', 'all'])
    )
    .addOption(
      new Option(
        '-n, --theme-name <name>',
        'Name of the theme. Cannot be used with -i or -a.'
      ).conflicts(['themeId', 'all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all the themes in the realm. Cannot be used with -i or -n.'
      ).conflicts(['themeId', 'themeName'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all themes. Required with -a when there is no terminal.'
      )
    )
    .requireOneOf({
      options: ['all', 'themeId', 'themeName'],
      purpose: 'what to delete',
    })
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
            what: 'all themes',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        // On a terminal the framework offers a theme to pick, after the
        // login, when -i and -n were both left out (cli record 0038). A
        // failed login, a declined pick and a failed read all stop here.
        if (!(await getTokens(false, true, deploymentTypes))) {
          process.exitCode = 1;
          return;
        }
        // delete by name
        if (options.themeName) {
          verboseMessage(
            `Deleting theme with name "${
              options.themeName
            }" from realm "${state.getRealm()}"...`
          );
          const outcome = await deleteThemeByName(options.themeName);
          if (!outcome) process.exitCode = 1;
        }
        // delete by id
        else if (options.themeId) {
          verboseMessage(
            `Deleting theme with id "${
              options.themeId
            }" from realm "${state.getRealm()}"...`
          );
          const outcome = await deleteTheme(options.themeId);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (options.all) {
          if (
            !(await confirmBulkDelete({
              what: 'all themes',
              yes: options.yes,
              dryRunAvailable: false,
            }))
          ) {
            process.exitCode = 1;
            return;
          }
          verboseMessage(
            `Deleting all themes from realm "${state.getRealm()}"...`
          );
          const outcome = await deleteThemes();
          if (!outcome) process.exitCode = 1;
        } else {
          // an empty list leaves nothing to pick from
          printMessage('No themes found to delete.');
        }
      }
      // end command logic inside action handler
    );

  return program;
}
