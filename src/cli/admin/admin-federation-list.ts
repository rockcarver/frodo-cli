import { frodo } from '@rockcarver/frodo-lib';

import { listAdminFederationProviders } from '../../ops/AdminFederationOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo admin federation list', ['realm']);

program
  .description('List admin federation providers.')
  // .addOption(
  //   new Option('-l, --long', 'Long with all fields.').default(false, 'false')
  // )
  .action(
    // implement command logic inside action handler
    async (host, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(host, user, password, options, command);
      if (await getTokens(true)) {
        verboseMessage(`Listing admin federation providers...`);
        const outcome = await listAdminFederationProviders();
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
