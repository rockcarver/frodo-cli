import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { exportAuthenticationSettingsToFile } from '../../ops/AuthenticationSettingsOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo authn export');

  program
    .description('Export authentication settings.')
    .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
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
          verboseMessage('Exporting authentication settings to file...');
          const outcome = exportAuthenticationSettingsToFile(
            options.file,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
