import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, OAuth2Client } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { listOAuth2Clients } = OAuth2Client;

const program = new FrodoCommand('frodo app list');

program
  .description('List OAuth2 applications.')
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
        verboseMessage(`Listing OAuth2 applications...`);
        listOAuth2Clients(options.long);
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
