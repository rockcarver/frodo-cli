import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportThemeById,
  exportThemeByName,
  exportThemesToFile,
  exportThemesToFiles,
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
  const program = new FrodoCommand('frodo theme export', [], deploymentTypes);

  program
    .description('Export themes.')
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
        '-f, --file [file]',
        'Name of the file to write the exported theme(s) to. Ignored with -A.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all the themes in a realm to a single file. Ignored with -n and -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all the themes in a realm as separate files <theme name>.theme.json. Ignored with -n, -i, and -a.'
      )
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
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
        // export by name
        if (
          options.themeName &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Exporting theme "${
              options.themeName
            }" from realm "${state.getRealm()}"...`
          );
          const outcome = await exportThemeByName(
            options.themeName,
            options.file,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
        }
        // export by id
        else if (
          options.themeId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Exporting theme "${
              options.themeId
            }" from realm "${state.getRealm()}"...`
          );
          const outcome = await exportThemeById(
            options.themeId,
            options.file,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all themes to a single file...');
          const outcome = await exportThemesToFile(
            options.file,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all themes to separate files...');
          const outcome = await exportThemesToFiles(options.metadata);
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
