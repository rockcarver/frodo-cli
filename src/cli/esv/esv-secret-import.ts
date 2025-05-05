import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  importSecretFromFile,
  importSecretsFromFile,
  importSecretsFromFiles,
} from '../../ops/cloud/SecretsOps';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv secret import',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Import secrets.')
    .addOption(
      new Option(
        '-i, --secret-id <secret-id>',
        'Secret id. If specified, only one secret is imported and the options -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
    .addOption(
      new Option(
        '-a, --all',
        'Import all secrets from single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all secrets from separate files (*.secret.json) in the current directory. Ignored with -i or -a.'
      )
    )
    .addOption(
      new Option(
        '--include-active-values',
        'Import any secret values contained in the import file. By default, secret values are encrypted server-side in the environment they are exported from. Use --source <host url> to import a file exported from another environment than the one you are importing to.'
      )
    )
    .addOption(
      new Option(
        '--source <host url>',
        'Host URL of the environment which performed secret value encryption. The URL must resolve to an existing connection profile. Use this option to import a file that was exported from a different source environment than the one you are importing to.'
      )
    )
    .addHelpText(
      'after',
      `How Frodo handles secrets:\n`['brightGreen'] +
        `  Frodo supports exporting and importing of ESV secret values. To leave stuartship of secret values with the cloud environment where they belong, frodo always encrypts values using either encryption keys from the source environment (default) or the target environment (--target parameter). Frodo never exports secrets in the clear.\n\n`[
          'brightGreen'
        ] +
        `Usage Examples:\n` +
        `  Import secrets including active secret values from a single file (Note: secrets must have been exported using the --include-active-values option):\n` +
        `  $ frodo esv secret import -a -f allAlphaSecrets.secret.json --include-active-values ${s.connId}\n`[
          'brightCyan'
        ] +
        `  Import secrets including active secret values from separate files in a directory (Note: secrets must have been exported using the --include-active-values option):\n` +
        `  $ frodo esv secret import -A -D ${s.connId}-secrets --include-active-values ${s.connId}\n`[
          'brightCyan'
        ] +
        `  Import secrets including active secret values from a single file that was exported from another environment using the --include-active-values option but without using the --target parameter, therefore requiring the --source parameter on import:\n` +
        `  The --source parameter instructs frodo to decrypt the secret values during import using the source environment, which was used to encrypt them.\n` +
        `  Using the --source parameter, the source environment must be available at the time of import and the person performing the import must have a connection profile for the source environment.\n` +
        `  $ frodo esv secret import -a -f allAlphaSecrets.secret.json --include-active-values --source ${s.connId} ${s.connId2}\n`[
          'brightCyan'
        ]
    )
    .action(
      // implement command logic inside action handler
      async (host, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          user,
          password,
          options,
          command
        );
        // import
        if (
          options.secretId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          printMessage(`Importing secret ${options.secretId}...`);
          const outcome = await importSecretFromFile(
            options.secretId,
            options.file,
            options.includeActiveValues,
            options.source
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          printMessage(
            `Importing all secrets from a single file (${options.file})...`
          );
          const outcome = await importSecretsFromFile(
            options.file,
            options.includeActiveValues,
            options.source
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          !options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          printMessage(
            'Importing all secrets from separate files in working directory...'
          );
          const outcome = await importSecretsFromFiles(
            options.includeActiveValues,
            options.source
          );
          if (!outcome) process.exitCode = 1;
        }
        // import first
        else if (
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          printMessage('Importing first secret in file...');
          const outcome = await importSecretFromFile(
            null,
            options.file,
            options.includeActiveValues,
            options.source
          );
          if (!outcome) process.exitCode = 1;
        }
        // unrecognized combination of options or no options
        else {
          printMessage('Unrecognized combination of options or no options...');
          program.help();
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
