import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, Realm } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console';

const { listRealms } = Realm;
const { getTokens } = Authenticate;

const program = new FrodoCommand('frodo realm list');

program
  .description('List realms.')
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
        verboseMessage('Listing all realms...');
        await listRealms(options.long);
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
