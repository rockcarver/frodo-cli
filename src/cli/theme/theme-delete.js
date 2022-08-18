import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import { AuthenticateOps, ThemeOps, state } from '@rockcarver/frodo-lib';

const { getTokens } = AuthenticateOps;
const { deleteThemeByNameCmd, deleteThemeCmd, deleteThemesCmd } = ThemeOps;

const program = new Command('frodo theme delete');

program
  .description('Delete themes.')
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
      '-a, --all',
      'Delete all the themes in the realm. Ignored with -n and -i.'
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
        // delete by name
        if (options.themeName) {
          console.log(
            `Deleting theme with name "${
              options.themeName
            }" from realm "${state.default.session.getRealm()}"...`
          );
          deleteThemeByNameCmd(options.themeName, options.file);
        }
        // delete by id
        else if (options.themeId) {
          console.log(
            `Deleting theme with id "${
              options.themeId
            }" from realm "${state.default.session.getRealm()}"...`
          );
          deleteThemeCmd(options.themeId, options.file);
        }
        // --all -a
        else if (options.all) {
          console.log(
            `Deleting all themes from realm "${state.default.session.getRealm()}"...`
          );
          deleteThemesCmd(options.file);
        }
        // unrecognized combination of options or no options
        else {
          console.log('Unrecognized combination of options or no options...');
          program.help();
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
