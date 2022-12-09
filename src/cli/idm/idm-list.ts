import { FrodoCommand } from '../FrodoCommand';
import { Authenticate } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console';
import {
  listAllConfigEntities,
  listOfflineConnectorServers,
} from '../../ops/IdmOps';

const { getTokens } = Authenticate;

const program = new FrodoCommand('frodo idm list');

program
  .description('List IDM configuration objects.')
  // .addOption(
  //   new Option('-l, --long', 'Long with all fields.').default(false, 'false')
  // )
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
        verboseMessage('Listing all IDM configuration objects...');
        listAllConfigEntities();
        listOfflineConnectorServers();
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
