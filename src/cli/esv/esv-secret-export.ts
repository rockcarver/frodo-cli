import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportSecretsToFile,
  exportSecretsToFiles,
  exportSecretToFile,
} from '../../ops/cloud/SecretsOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv secret export',
    ['realm'],
    deploymentTypes
  );

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
    .addOption(
      new Option(
        '--include-active-values',
        'Include the currently active (and loaded) secret value in the export. By default, secret values are encrypted server-side in the environment they are exported from. Use --target <host url> to have another environment perform the encryption.'
      )
    )
    .addOption(
      new Option(
        '--target <host url>',
        'Host URL of the environment to perform secret value encryption. The URL must resolve to an existing connection profile. Use this option to generate an export that can be imported into the target environment without requiring admin access to the source environment.'
      )
    )
    .addHelpText(
      'after',
      `How Frodo handles secrets:\n`['brightGreen'] +
        `  Frodo supports exporting and importing of ESV secret values. To leave stuartship of secret values with the cloud environment where they belong, frodo always encrypts values using either encryption keys from the source environment (default) or the target environment (--target parameter). Frodo never exports secrets in the clear.\n\n`[
          'brightGreen'
        ] +
        `Usage Examples:\n` +
        `  Export secrets including active secret values to a single file (Note: only values of active and loaded secrets can be exported):\n` +
        `  $ frodo esv secret export -a --include-active-values ${s.connId}\n`[
          'brightCyan'
        ] +
        `  Export secrets including active secret values to individual files in a directory (Note: only values of active and loaded secrets can be exported):\n` +
        `  $ frodo esv secret export -A -D ${s.connId}-secrets --include-active-values ${s.connId}\n`[
          'brightCyan'
        ] +
        `  Export secrets including active secret values to a single file for import into another environment.\n` +
        `  The --target parameter instructs frodo to encrypt the exported secret values using the target environment so they can be imported into that target environment without requiring the source environment they were exported from.\n` +
        `  Using the --target parameter, the target environment must be available at the time of export and the person performing the export must have a connection profile for the target environment.\n` +
        `  Without the --target parameter, the source environment must be available at the time of import and the person performing the import must have a connection profile for the source environment.\n` +
        `  $ frodo esv secret export -a --include-active-values --target ${s.connId2} ${s.connId}\n`[
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
        if (
          options.secretId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Exporting secret "${
              options.secretId
            }" from realm "${state.getRealm()}"...`
          );
          const outcome = await exportSecretToFile(
            options.secretId,
            options.file,
            options.metadata,
            options.includeActiveValues,
            options.target
          );
          if (!outcome) process.exitCode = 1;
        } else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all secrets to a single file...');
          const outcome = await exportSecretsToFile(
            options.file,
            options.metadata,
            options.includeActiveValues,
            options.target
          );
          if (!outcome) process.exitCode = 1;
        } else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all secrets to separate files...');
          const outcome = await exportSecretsToFiles(
            options.metadata,
            options.includeActiveValues,
            options.target
          );
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

  return program;
}
