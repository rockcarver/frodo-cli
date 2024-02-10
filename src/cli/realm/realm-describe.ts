import { frodo, state } from '@rockcarver/frodo-lib';

import { getTokens } from '../../ops/AuthenticateOps';
import { describeRealm } from '../../ops/RealmOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

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
      describeRealm(frodo.utils.getRealmName(state.getRealm()));
    } else {
      process.exitCode = 1;
    }
  }
  // end command logic inside action handler
);

program.parse();
