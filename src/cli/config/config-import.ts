import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  importEntityfromFile,
  importEverythingFromFile,
  importEverythingFromFiles,
} from '../../ops/ConfigOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
  IDM_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
  IDM_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo config import', [], deploymentTypes);

  program
    .description('Import full cloud configuration.')
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the file to import. Ignored with -A. If included without -a, it will import the single entity within the file.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all configuration from the single file -f. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all configuration from separate (.json) files in the (working) directory -D. Ignored with -i or -a.'
      )
    )
    .addOption(
      new Option('-C, --clean', 'Remove existing service(s) before importing.')
    )
    .addOption(
      new Option(
        '--re-uuid-journeys',
        'Generate new UUIDs for all journey nodes during import.'
      ).default(false, 'off')
    )
    .addOption(
      new Option(
        '--re-uuid-scripts',
        'Create new UUIDs for the scripts upon import. Use this to duplicate scripts or create a new versions of the same scripts.'
      ).default(false, 'off')
    )
    .addOption(
      new Option(
        '-d, --default',
        'Import all scripts including the default scripts.'
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
    .addOption(
      new Option(
        '-g, --global',
        'Import global entity. Ignored with -a and -A.'
      )
    )
    .addHelpText(
      'after',
      `How Frodo handles secrets:\n`['brightGreen'] +
        `  Frodo supports exporting and importing of ESV secret values. To leave stuartship of secret values with the cloud environment where they belong, frodo always encrypts values using either encryption keys from the source environment (default) or the target environment (--target parameter). Frodo never exports secrets in the clear.\n\n`[
          'brightGreen'
        ] +
        `Usage Examples:\n` +
        `  Restore global and active realm configuration including active secret values from a single file (Note: config export must have been performed using the --include-active-values option):\n` +
        `  $ frodo config import -a -f Alpha.everything.json --include-active-values ${s.connId}\n`[
          'brightCyan'
        ] +
        `  Restore global and active realm configuration including active secret values from separate files in a directory structure (Note: config export must have been performed using the --include-active-values option):\n` +
        `  $ frodo config import -A -D ${s.connId}-backup --include-active-values ${s.connId}\n`[
          'brightCyan'
        ] +
        `  Import global and active realm configuration including active secret values, wich were exported from another environment using the --include-active-values option but without using the --target parameter, therefore requiring the --source parameter on import:\n` +
        `  The --source parameter instructs frodo to decrypt the secret values during import using the source environment, which was used to encrypt them.\n` +
        `  Using the --source parameter, the source environment must be available at the time of import and the person performing the import must have a connection profile for the source environment.\n` +
        `  $ frodo config import -a -f Alpha.everything.json --include-active-values --source ${s.connId} ${s.connId2}\n`[
          'brightCyan'
        ]
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
        // Require --file -f for all function
        if (options.all && !options.file) {
          printMessage('-f or --file required when using -a or --all', 'error');
          program.help();
          process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting everything from a single file...');
          const outcome = await importEverythingFromFile(options.file, {
            reUuidJourneys: options.reUuidJourneys,
            reUuidScripts: options.reUuidScripts,
            cleanServices: options.clean,
            includeDefault: options.default,
            includeActiveValues: options.includeActiveValues,
            source: options.source,
          });
          if (!outcome) process.exitCode = 1;
        }
        // require --directory -D for all-separate function
        else if (options.allSeparate && !state.getDirectory()) {
          printMessage(
            '-D or --directory required when using -A or --all-separate',
            'error'
          );
          program.help();
          process.exitCode = 1;
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Importing everything from separate files...');
          const outcome = await importEverythingFromFiles({
            reUuidJourneys: options.reUuidJourneys,
            reUuidScripts: options.reUuidScripts,
            cleanServices: options.clean,
            includeDefault: options.default,
            includeActiveValues: options.includeActiveValues,
            source: options.source,
          });
          if (!outcome) process.exitCode = 1;
        }
        // Import entity from file
        else if (
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Importing config entity from file...');
          const outcome = await importEntityfromFile(
            options.file,
            options.global,
            {
              reUuidJourneys: options.reUuidJourneys,
              reUuidScripts: options.reUuidScripts,
              cleanServices: options.clean,
              includeDefault: options.default,
              includeActiveValues: options.includeActiveValues,
              source: options.source,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // unrecognized combination of options or no options
        else {
          verboseMessage(
            'Unrecognized combination of options or no options...'
          );
          program.help();
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
