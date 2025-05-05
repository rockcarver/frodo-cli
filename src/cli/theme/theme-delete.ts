import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteTheme,
  deleteThemeByName,
  deleteThemes,
} from '../../ops/ThemeOps';
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
        '-n, --theme-name <name>',
        'Name of the theme. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-i, --theme-id <uuid>',
        'Uuid of the theme. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all the themes in the realm. Ignored with -n and -i.'
      )
    )
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
        // delete by name
        if (
          options.themeName &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Deleting theme with name "${
              options.themeName
            }" from realm "${state.getRealm()}"...`
          );
          const outcome = await deleteThemeByName(options.themeName);
          if (!outcome) process.exitCode = 1;
        }
        // delete by id
        else if (
          options.themeId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Deleting theme with id "${
              options.themeId
            }" from realm "${state.getRealm()}"...`
          );
          const outcome = await deleteTheme(options.themeId);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Deleting all themes from realm "${state.getRealm()}"...`
          );
          const outcome = await deleteThemes();
          if (!outcome) process.exitCode = 1;
        }
        // unrecognized combination of options or no options
        else {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
          program.help();
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
