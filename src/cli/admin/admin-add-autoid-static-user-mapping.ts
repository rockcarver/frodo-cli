import { FrodoCommand } from '../FrodoCommand';
import { frodo } from '@rockcarver/frodo-lib';
import { printMessage } from '../../utils/Console.js';

const program = new FrodoCommand('frodo admin add-autoid-static-user-mapping');

program
  .description(
    'Add AutoId static user mapping to enable dashboards and other AutoId-based functionality.'
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
        printMessage(`Adding AutoId static user mapping...`);
        await frodo.admin.addAutoIdStaticUserMapping();
        printMessage('Done.');
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
