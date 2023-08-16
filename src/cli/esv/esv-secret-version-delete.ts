import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { deleteVersionOfSecret } from '../../ops/SecretsOps';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo esv secret version delete');

program
  .description('Delete versions of secrets.')
  .addOption(
    new Option(
      '-i, --secret-id <secret-id>',
      'Secret id. If specified, -a is ignored.'
    )
  )
  .addOption(new Option('-v, --version <version>', 'Version of secret.'))
  .addOption(
    new Option('-a, --all', 'Delete all secrets in a realm. Ignored with -i.')
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
      // delete by id
      if (options.secretId && options.version && (await getTokens())) {
        verboseMessage(`Deleting version of secret...`);
        deleteVersionOfSecret(options.secretId, options.version);
      }
      // --all -a
      // else if (options.all && (await getTokens())) {
      //   printMessage('Deleting all versions...');
      //   deleteJourneys(options);
      // }
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
