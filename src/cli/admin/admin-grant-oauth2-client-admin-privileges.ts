import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo, state } from '@rockcarver/frodo-lib';
import { printMessage } from '../../utils/Console.js';

const program = new FrodoCommand(
  'frodo admin grant-oauth2-client-admin-privileges'
);

program
  .description('Grant an oauth2 client admin privileges.')
  .addOption(
    new Option('-t, --target <target name or id>', 'Name of the oauth2 client.')
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
      if (await frodo.login.getTokens()) {
        printMessage(
          `Granting oauth2 client "${
            options.target
          }" in realm "${state.getRealm()}" admin privileges...`
        );
        await frodo.admin.grantOAuth2ClientAdminPrivileges(options.target);
        printMessage('Done.');
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
