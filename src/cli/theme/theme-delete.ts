import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo, state } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console';
import {
  deleteThemeByNameCmd,
  deleteThemeCmd,
  deleteAllThemes,
} from '../../ops/ThemeOps';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo theme delete');

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
      if (options.themeName && (await getTokens())) {
        verboseMessage(
          `Deleting theme with name "${
            options.themeName
          }" from realm "${state.getRealm()}"...`
        );
        deleteThemeByNameCmd(options.themeName);
      }
      // delete by id
      else if (options.themeId && (await getTokens())) {
        verboseMessage(
          `Deleting theme with id "${
            options.themeId
          }" from realm "${state.getRealm()}"...`
        );
        deleteThemeCmd(options.themeId);
      }
      // --all -a
      else if (options.all && (await getTokens())) {
        verboseMessage(
          `Deleting all themes from realm "${state.getRealm()}"...`
        );
        deleteAllThemes();
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

program.parse();
