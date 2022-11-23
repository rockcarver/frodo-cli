import { Command, Option } from 'commander';
import * as common from '../cmd_common';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console';
import {
  importFirstThemeFromFile,
  importThemeById,
  importThemeByName,
  importThemesFromFile,
  importThemesFromFiles,
} from '../../ops/ThemeOps';

const { getTokens } = Authenticate;

const program = new Command('frodo theme import');

program
  .description('Import themes.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(common.curlirizeOption)
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
    async (host, realm, user, password, options) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      // import by name
      if (options.file && options.themeName && (await getTokens())) {
        verboseMessage(
          `Importing theme with name "${
            options.themeName
          }" into realm "${state.default.session.getRealm()}"...`
        );
        importThemeByName(options.themeName, options.file);
      }
      // import by id
      else if (options.file && options.themeId && (await getTokens())) {
        verboseMessage(
          `Importing theme with id "${
            options.themeId
          }" into realm "${state.default.session.getRealm()}"...`
        );
        importThemeById(options.themeId, options.file);
      }
      // --all -a
      else if (options.all && options.file && (await getTokens())) {
        verboseMessage(
          `Importing all themes from a single file (${options.file})...`
        );
        importThemesFromFile(options.file);
      }
      // --all-separate -A
      else if (options.allSeparate && !options.file && (await getTokens())) {
        verboseMessage(
          'Importing all themes from separate files in current directory...'
        );
        importThemesFromFiles();
      }
      // import single theme from file
      else if (options.file && (await getTokens())) {
        verboseMessage(
          `Importing first theme from file "${
            options.file
          }" into realm "${state.default.session.getRealm()}"...`
        );
        importFirstThemeFromFile(options.file);
      }
      // unrecognized combination of options or no options
      else {
        printMessage(
          'Unrecognized combination of options or no options...',
          'error'
        );
        program.help();
      }
    }
    // end command logic inside action handler
  );

program.parse();
