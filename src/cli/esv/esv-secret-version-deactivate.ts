import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { deactivateVersionOfSecret } from '../../ops/SecretsOps';

const { getTokens } = frodo.login;

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
        deactivateVersionOfSecret(options.secretId, options.version);
      }
      // unrecognized combination of options or no options
      else {
        printMessage('Unrecognized combination of options or no options...');
        program.help();
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
