import { FrodoCommand } from '../FrodoCommand';
import { frodo, state } from '@rockcarver/frodo-lib';
import { printMessage } from '../../utils/Console.js';

const program = new FrodoCommand(
  'frodo admin list-oauth2-clients-with-custom-privileges'
);

program.description('List oauth2 clients with custom privileges.').action(
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
        `Listing oauth2 clients with custom privileges in realm "${state.getRealm()}"...`
      );
      const adminClients = await frodo.admin.listOAuth2CustomClients();
      adminClients.sort((a, b) => a.localeCompare(b));
      adminClients.forEach((item) => {
        printMessage(`${item}`);
      });
    } else {
      process.exitCode = 1;
    }
  }
  // end command logic inside action handler
);

program.parse();
