import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  importEverythingFromFile,
  importEverythingFromFiles,
} from '../../ops/ConfigOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo config import');

program
  .description('Import full cloud configuration.')
  .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
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
    new Option('-g, --global', 'Import service(s) as global service(s).')
  )
  .addOption(
    new Option(
      '-r, --current-realm',
      'Import service(s) into the current realm.'
    )
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
        // --all -a
      } else if (options.all && (await getTokens())) {
        verboseMessage('Exporting everything from a single file...');
        await importEverythingFromFile(options.file, {
          reUuidJourneys: options.reUuidJourneys,
          reUuidScripts: options.reUuidScripts,
          cleanServices: options.clean,
          global: options.global,
          realm: options.realm,
        });
        // require --directory -D for all-separate function
      } else if (options.allSeparate && !state.getDirectory()) {
        printMessage(
          '-D or --directory required when using -A or --all-separate',
          'error'
        );
        program.help();
        process.exitCode = 1;
        // --all-separate -A
      } else if (options.allSeparate && (await getTokens())) {
        verboseMessage('Importing everything from separate files...');
        await importEverythingFromFiles({
          reUuidJourneys: options.reUuidJourneys,
          reUuidScripts: options.reUuidScripts,
          cleanServices: options.clean,
          global: options.global,
          realm: options.realm,
        });
        // unrecognized combination of options or no options
      } else {
        verboseMessage('Unrecognized combination of options or no options...');
        program.help();
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
