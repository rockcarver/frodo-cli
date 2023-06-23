import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo, state } from '@rockcarver/frodo-lib';
import { printMessage } from '../../utils/Console.js';

const { getTokens } = frodo.login;
const { revokeOAuth2ClientAdminPrivileges } = frodo.admin;

const program = new FrodoCommand(
  'frodo admin revoke-oauth2-client-admin-privileges'
);

program
  .description('Revoke admin privileges from an oauth2 client.')
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
      if (await getTokens()) {
        printMessage(
          `Revoking admin privileges from oauth2 client "${
            options.target
          }" in realm "${state.getRealm()}"...`
        );
        await revokeOAuth2ClientAdminPrivileges(options.target);
        printMessage('Done.');
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
