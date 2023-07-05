import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';
import { createSecret } from '../../ops/SecretsOps';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo esv secret create');

program
  .description('Create secrets.')
  .requiredOption('-i, --secret-id <secret-id>', 'Secret id.')
  .requiredOption('--value <value>', 'Secret value.')
  .option('--description [description]', 'Secret description.')
  .addOption(
    new Option(
      '--encoding [encoding]',
      'Secret encoding. Must be one of "generic", "pem", "base64hmac"'
    ).default('generic', 'generic')
  )
  .addOption(
    new Option(
      '--no-use-in-placeholders',
      'Secret cannot be used in placeholders.'
    )
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
        verboseMessage('Creating secret...');
        createSecret(
          options.secretId,
          options.value,
          options.description,
          options.encoding,
          options.useInPlaceholders
        );
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
