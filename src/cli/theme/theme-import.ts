import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  importFirstThemeFromFile,
  importThemeById,
  importThemeByName,
  importThemesFromFile,
  importThemesFromFiles,
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
  const program = new FrodoCommand('frodo theme import', [], deploymentTypes);

  program
    .description('Import themes.')
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
        '-f, --file <file>',
        'Name of the file to import the theme(s) from.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all the themes from single file. Ignored with -n or -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all the themes from separate files (*.json) in the current directory. Ignored with -n or -i or -a.'
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
        // import by name
        if (
          options.file &&
          options.themeName &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing theme with name "${
              options.themeName
            }" into realm "${state.getRealm()}"...`
          );
          const outcome = await importThemeByName(
            options.themeName,
            options.file
          );
          if (!outcome) process.exitCode = 1;
        }
        // import by id
        else if (
          options.file &&
          options.themeId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing theme with id "${
              options.themeId
            }" into realm "${state.getRealm()}"...`
          );
          const outcome = await importThemeById(options.themeId, options.file);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing all themes from a single file (${options.file})...`
          );
          const outcome = await importThemesFromFile(options.file);
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          !options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            'Importing all themes from separate files in current directory...'
          );
          const outcome = await importThemesFromFiles();
          if (!outcome) process.exitCode = 1;
        }
        // import single theme from file
        else if (
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing first theme from file "${
              options.file
            }" into realm "${state.getRealm()}"...`
          );
          const outcome = await importFirstThemeFromFile(options.file);
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
