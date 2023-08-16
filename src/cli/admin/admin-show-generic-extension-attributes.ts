import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { printMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;
const { showGenericExtensionAttributes } = frodo.admin;

const program = new FrodoCommand(
  'frodo admin show-generic-extension-attributes'
);

program
  .description('Show generic extension attributes.')
  .addOption(
    new Option(
      '--include-customized',
      'Include customized attributes.'
    ).default(false, 'false')
  )
  .addOption(
    new Option('--dry-run', 'Dry-run only, do not perform changes.').default(
      false,
      'false'
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
      if (await getTokens()) {
        printMessage(
          `Showing generic extension attributes in realm "${state.getRealm()}"...`
        );
        await showGenericExtensionAttributes(
          options.includeCustomized,
          options.dryRun
        );
        printMessage('Done.');
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
