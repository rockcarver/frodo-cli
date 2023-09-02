import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo oauth client describe');

program
  .description('Describe OAuth2 application.')
  .addOption(new Option('-i, --app-id <id>', 'OAuth2 application id/name.'))
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
        // code goes here
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
