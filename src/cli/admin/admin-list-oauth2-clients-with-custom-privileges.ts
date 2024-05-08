import { state } from '@rockcarver/frodo-lib';

import { listOAuth2CustomClients } from '../../ops/AdminOps';
import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
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
      if (await getTokens()) {
        printMessage(
          `Listing oauth2 clients with custom privileges in realm "${state.getRealm()}"...`
        );
        const outcome = await listOAuth2CustomClients();
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

  return program;
}
