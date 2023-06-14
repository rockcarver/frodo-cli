import { FrodoCommand } from '../FrodoCommand';
import { frodo, state } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console';
import { describeRealm } from '../../ops/RealmOps';

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
    if (await frodo.login.getTokens()) {
      verboseMessage(`Retrieving details of realm ${state.getRealm()}...`);
      describeRealm(frodo.helper.utils.getRealmName(state.getRealm()));
    } else {
      process.exitCode = 1;
    }
  }
  // end command logic inside action handler
);

program.parse();
