import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import { AuthenticateOps, ThemeOps, state } from '@rockcarver/frodo-lib';
const { getTokens } = AuthenticateOps;

const {
  exportThemeById,
  exportThemeByName,
  exportThemesToFile,
  exportThemesToFiles,
} = ThemeOps;

const program = new Command('frodo theme export');

program
  .description('Export themes.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
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
  .action(
    // implement command logic inside action handler
    async (host, realm, user, password, options) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      if (await getTokens()) {
        // export by name
        if (options.themeName) {
          console.log(
            `Exporting theme "${
              options.themeName
            }" from realm "${state.default.session.getRealm()}"...`
          );
          exportThemeByName(options.themeName, options.file);
        }
        // export by id
        else if (options.themeId) {
          console.log(
            `Exporting theme "${
              options.themeId
            }" from realm "${state.default.session.getRealm()}"...`
          );
          exportThemeById(options.themeId, options.file);
        }
        // --all -a
        else if (options.all) {
          console.log('Exporting all themes to a single file...');
          exportThemesToFile(options.file);
        }
        // --all-separate -A
        else if (options.allSeparate) {
          console.log('Exporting all themes to separate files...');
          exportThemesToFiles();
        }
        // unrecognized combination of options or no options
        else {
          console.log(
            'Unrecognized combination of options or no options...',
            'error'
          );
          program.help();
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
