import { FrodoCommand } from '../FrodoCommand';
import { Authenticate, Realm, Utils, state } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console';

const { getRealmName } = Utils;
const { getTokens } = Authenticate;
const { describe } = Realm;

const program = new FrodoCommand('frodo realm describe');

program.description('Describe realms.').action(
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
      verboseMessage(`Retrieving details of realm ${state.getRealm()}...`);
      describe(getRealmName(state.getRealm()));
    } else {
      process.exitCode = 1;
    }
  }
  // end command logic inside action handler
);

program.parse();
