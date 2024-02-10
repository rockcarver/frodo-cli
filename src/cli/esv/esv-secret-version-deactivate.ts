import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { deactivateVersionOfSecret } from '../../ops/SecretsOps';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const program = new FrodoCommand('frodo esv secret version deactivate');

program
  .description('Deactivate versions of secrets.')
  .addOption(new Option('-i, --secret-id <secret-id>', 'Secret id.'))
  .addOption(new Option('-v, --version <version>', 'Version of secret.'))
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
      // activate by id
      if (options.secretId && options.version && (await getTokens())) {
        verboseMessage(`Deactivating version of secret...`);
        const outcome = await deactivateVersionOfSecret(
          options.secretId,
          options.version
        );
        if (!outcome) process.exitCode = 1;
      }
      // unrecognized combination of options or no options
      else {
        printMessage('Unrecognized combination of options or no options...');
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
