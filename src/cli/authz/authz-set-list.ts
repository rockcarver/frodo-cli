import { FrodoCommand } from '../FrodoCommand';
import { frodo } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';
import { listPolicySets } from '../../ops/PolicySetOps';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo authz set list');

program.description('List authorization policy sets.').action(
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
      verboseMessage('Listing authorization policy sets...');
      const outcome = listPolicySets();
      if (!outcome) process.exitCode = 1;
    } else {
      process.exitCode = 1;
    }
  }
  // end command logic inside action handler
);

program.parse();
