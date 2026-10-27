import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportThemeById,
  exportThemeByName,
  exportThemesToFile,
  exportThemesToFiles,
} from '../../ops/ThemeOps';
import { verboseMessage } from '../../utils/Console';
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
        '-i, --theme-id <uuid>',
        'Uuid of the theme. Cannot be used with -n, -a or -A.'
      ).conflicts(['themeName', 'all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-n, --theme-name <name>',
        'Name of the theme. Cannot be used with -i, -a or -A.'
      ).conflicts(['themeId', 'all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file [file]',
        'Name of the file to write the exported theme(s) to. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all the themes in a realm to a single file. Cannot be used with -i, -n or -A.'
      ).conflicts(['themeId', 'themeName', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all the themes in a realm as separate files <theme name>.theme.json. Cannot be used with -i, -n, -f or -a.'
      ).conflicts(['themeId', 'themeName', 'file', 'all'])
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .addOption(
      new Option(
        '-x, --no-extract',
        'Do not extract the HTML from the exported file to a separate file.'
      ).default(true, 'true')
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'themeId', 'themeName'],
      purpose: 'what to export',
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
            options.metadata,
            options.extract
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
            options.metadata,
            options.extract
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
          const outcome = await exportThemesToFiles(
            options.metadata,
            options.extract
          );
          if (!outcome) process.exitCode = 1;
        }
        // No branch ran: with requireOneOf satisfied, the only way
        // here is getTokens() failing -- keep the old exit-1 semantics
        // (the removed else handled auth failure too).
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
