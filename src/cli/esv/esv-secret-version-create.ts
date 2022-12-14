import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, Secrets } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { createNewVersionOfSecretCmd } = Secrets;

const program = new FrodoCommand('frodo esv secret version create');

program
  .description('Create new version of secret.')
  .addOption(new Option('-i, --secret-id <secret-id>', 'Secret id.'))
  .addOption(new Option('--value <value>', 'Secret value.'))
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
        verboseMessage('Creating new version of secret...');
        createNewVersionOfSecretCmd(options.secretId, options.value);
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
