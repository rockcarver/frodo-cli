import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate } from '@rockcarver/frodo-lib';

const { getTokens } = Authenticate;

const program = new FrodoCommand('frodo something other list');

program
  .description('List other.')
  .addOption(
    new Option('-l, --long', 'Long with all fields.').default(false, 'false')
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
        // code goes here
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
