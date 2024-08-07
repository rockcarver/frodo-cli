import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { listResourceTypes } from '../../ops/ResourceTypeOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo authz type list');

  program
    .description('List authorization resource types.')
    .addOption(
      new Option('-l, --long', 'Long with more fields.').default(false, 'false')
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
          verboseMessage('Listing resource types...');
          const outcome = await listResourceTypes(options.long);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
