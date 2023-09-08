import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { printMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;
const { removeStaticUserMapping } = frodo.admin;

const program = new FrodoCommand('frodo admin remove-static-user-mapping');

program
  .description("Remove a subject's static user mapping.")
  .addOption(new Option('-i, --sub-id <id>', 'Subject identifier.'))
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
        printMessage("Removing a subject's static user mapping...");
        await removeStaticUserMapping(options.subId);
        printMessage('Done.');
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
