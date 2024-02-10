import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { importAuthenticationSettingsFromFile } from '../../ops/AuthenticationSettingsOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const program = new FrodoCommand('frodo authn import');

program
  .description('Import authentication settings.')
  .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
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
        verboseMessage('Importing authentication settings from file...');
        const outcome = importAuthenticationSettingsFromFile(options.file);
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
