import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';
import { listSecretVersions } from '../../ops/SecretsOps';

const { getTokens } = frodo.login;

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
        listSecretVersions(options.secretId);
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
