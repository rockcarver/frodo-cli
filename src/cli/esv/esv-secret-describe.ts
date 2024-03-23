import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { describeSecret } from '../../ops/cloud/SecretsOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

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
        const outcome = await describeSecret(options.secretId);
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
