import { FrodoCommand } from '../FrodoCommand';
import { Authenticate, Idp, state } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console';

const { getTokens } = Authenticate;
const { listSocialProviders } = Idp;

const program = new FrodoCommand('frodo idp list');

program
  .description('List (social) identity providers.')
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
        verboseMessage(`Listing providers in realm "${state.getRealm()}"...`);
        listSocialProviders();
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
