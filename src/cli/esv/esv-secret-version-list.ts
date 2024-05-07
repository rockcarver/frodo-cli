import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { listSecretVersions } from '../../ops/cloud/SecretsOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo esv secret version list');

  program
    .description('List versions of secret.')
    .addOption(new Option('-i, --secret-id <secret-id>', 'Secret id.'))
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
          verboseMessage('Listing versions...');
          const outcome = await listSecretVersions(options.secretId);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
