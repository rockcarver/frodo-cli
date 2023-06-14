import { FrodoCommand } from '../FrodoCommand';
import { frodo } from '@rockcarver/frodo-lib';
import { printMessage } from '../../utils/Console.js';

const program = new FrodoCommand('frodo admin remove-static-user-mapping');

program.description("Remove a subject's static user mapping.").action(
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
      printMessage("Removing a subject's static user mapping...");
      await frodo.admin.removeStaticUserMapping(options.subject);
      printMessage('Done.');
    } else {
      process.exitCode = 1;
    }
  }
  // end command logic inside action handler
);

program.parse();
