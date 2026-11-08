import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { trackLogin } from '../../ops/AuthenticateOps';
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
        '-i, --theme-id <uuid>',
        'Uuid of the theme. Cannot be used with -n, -a or A.'
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
        '-f, --file <file>',
        'Name of the file to import the theme(s) from. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all the themes from single file. Cannot be used with -i, -n or -A.'
      ).conflicts(['themeId', 'themeName', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all the themes from separate files (*.json) in the current directory. Cannot be used with -i, -n, -f or -a.'
      ).conflicts(['themeId', 'themeName', 'file', 'all'])
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'file', 'themeId', 'themeName'],
      purpose: 'what to import',
    })
    .multiOp()
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
        // a failed login has said why: it must not be reported as unrecognized options
        const { login, loginFailed } = trackLogin();
        // import by name
        if (
          options.file &&
          options.themeName &&
          (await login(false, true, deploymentTypes))
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
          (await login(false, true, deploymentTypes))
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
          (await login(false, true, deploymentTypes))
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
          (await login(false, true, deploymentTypes))
        ) {
          verboseMessage(
            'Importing all themes from separate files in current directory...'
          );
          const outcome = await importThemesFromFiles(options.allowFailures);
          if (!outcome) process.exitCode = 1;
        }
        // import single theme from file
        else if (options.file && (await login(false, true, deploymentTypes))) {
          verboseMessage(
            `Importing first theme from file "${
              options.file
            }" into realm "${state.getRealm()}"...`
          );
          const outcome = await importFirstThemeFromFile(options.file);
          if (!outcome) process.exitCode = 1;
        }
        // a failed login has been reported by getTokens
        else if (loginFailed()) {
          process.exitCode = 1;
        }
        // unrecognized combination of options or no options
        else {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
          process.exitCode = 1;
          program.help();
        }
      }
      // end command logic inside action handler
    );

  return program;
}
