import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportSecretsToFile,
  exportSecretsToFiles,
  exportSecretToFile,
} from '../../ops/SecretsOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const program = new FrodoCommand('frodo esv secret export');

program
  .description('Export secrets.')
  .addOption(
    new Option(
      '-i, --secret-id <secret-id>',
      'Secret id. If specified, -a and -A are ignored.'
    )
  )
  .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
  .addOption(
    new Option(
      '-a, --all',
      'Export all secrets to a single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all sub1s to separate files (*.secret.json) in the current directory. Ignored with -i or -a.'
    )
  )
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
      if (options.secretId && (await getTokens())) {
        verboseMessage(
          `Exporting secret "${
            options.secretId
          }" from realm "${state.getRealm()}"...`
        );
        const outcome = await exportSecretToFile(
          options.secretId,
          options.file,
          options.metadata
        );
        if (!outcome) process.exitCode = 1;
      } else if (options.all && (await getTokens())) {
        verboseMessage('Exporting all secrets to a single file...');
        const outcome = await exportSecretsToFile(
          options.file,
          options.metadata
        );
        if (!outcome) process.exitCode = 1;
      } else if (options.allSeparate && (await getTokens())) {
        verboseMessage('Exporting all secrets to separate files...');
        const outcome = await exportSecretsToFiles(options.metadata);
        if (!outcome) process.exitCode = 1;
      } else {
        printMessage(
          'Unrecognized combination of options or no options...',
          'error'
        );
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
