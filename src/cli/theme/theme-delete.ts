import { Command, Option } from 'commander';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import { printMessage } from '../../utils/Console';
import {
  deleteThemeByNameCmd,
  deleteThemeCmd,
  deleteAllThemes,
} from '../../ops/ThemeOps';

const { getTokens } = Authenticate;

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
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      // delete by name
      if (options.themeName && (await getTokens())) {
        printMessage(
          `Deleting theme with name "${
            options.themeName
          }" from realm "${state.default.session.getRealm()}"...`
        );
        deleteThemeByNameCmd(options.themeName);
      }
      // delete by id
      else if (options.themeId && (await getTokens())) {
        printMessage(
          `Deleting theme with id "${
            options.themeId
          }" from realm "${state.default.session.getRealm()}"...`
        );
        deleteThemeCmd(options.themeId);
      }
      // --all -a
      else if (options.all && (await getTokens())) {
        printMessage(
          `Deleting all themes from realm "${state.default.session.getRealm()}"...`
        );
        deleteAllThemes();
      }
      // unrecognized combination of options or no options
      else {
        printMessage('Unrecognized combination of options or no options...');
        program.help();
      }
    }
    // end command logic inside action handler
  );

program.parse();
