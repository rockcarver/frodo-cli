import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, CirclesOfTrust, state } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console';

const { getTokens } = Authenticate;
const { listCirclesOfTrust } = CirclesOfTrust;

const program = new FrodoCommand('frodo saml cot list');

program
  .description('List SAML circles of trust.')
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
        verboseMessage(
          `Listing SAML circles of trust in realm "${state.getRealm()}"...`
        );
        listCirclesOfTrust(options.long);
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
