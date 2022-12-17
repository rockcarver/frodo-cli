import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, Secrets } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { describeSecret } = Secrets;

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
      if (await getTokens()) {
        verboseMessage(`Describing secret ${options.secretId}...`);
        describeSecret(options.secretId);
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
