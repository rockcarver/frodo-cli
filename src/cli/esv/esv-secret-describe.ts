import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';
import { describeSecret } from '../../ops/SecretsOps';

const program = new FrodoCommand('frodo esv secret describe');

program
  .description('Describe secrets.')
  .addOption(
    new Option(
      '-i, --secret-id <secret-id>',
      'Secret id.'
    ).makeOptionMandatory()
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
      if (await frodo.login.getTokens()) {
        verboseMessage(`Describing secret ${options.secretId}...`);
        describeSecret(options.secretId);
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
