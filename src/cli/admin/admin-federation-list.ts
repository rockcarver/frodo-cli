import { Command } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { listAdminFederationProviders } from '../../ops/cloud/AdminFederationOps';
import { verboseMessage } from '../../utils/Console';

export const addFederationList = (command: Command) => {
  command
    .command('list')
    .description('List admin federation providers.')
    // .addOption(
    //   new Option('-l, --long', 'Long with all fields.').default(false, 'false')
    // )
    .action(
      // implement command logic inside action handler
      async (host, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          user,
          password,
          options,
          command
        );
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
};
