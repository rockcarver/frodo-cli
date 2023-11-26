import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  importFirstJourneyFromFile,
  importJourneyFromFile,
  importJourneysFromFile,
  importJourneysFromFiles,
} from '../../ops/JourneyOps';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo journey import');

program
  .description('Import journey/tree.')
  .addOption(
    new Option(
      '-i, --journey-id <journey>',
      'Name of a journey/tree. If specified, -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '-f, --file <file>',
      'Name of the file to import the journey(s) from. Ignored with -A.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Import all the journeys/trees from single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Import all the journeys/trees from separate files (*.json) in the current directory. Ignored with -i or -a.'
    )
  )
  .addOption(
    new Option(
      '--re-uuid',
      'Generate new UUIDs for all nodes during import.'
    ).default(false, 'off')
  )
  .addOption(
    new Option(
      '--no-deps',
      'Do not include any dependencies (scripts, email templates, SAML entity providers and circles of trust, social identity providers, themes).'
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
      // import
      if (options.journeyId && (await getTokens())) {
        printMessage(`Importing journey ${options.journeyId}...`);
        await importJourneyFromFile(options.journeyId, options.file, {
          reUuid: options.reUuid,
          deps: options.deps,
        });
      }
      // --all -a
      else if (options.all && options.file && (await getTokens())) {
        printMessage(
          `Importing all journeys from a single file (${options.file})...`
        );
        await importJourneysFromFile(options.file, {
          reUuid: options.reUuid,
          deps: options.deps,
        });
      }
      // --all-separate -A
      else if (options.allSeparate && !options.file && (await getTokens())) {
        printMessage(
          'Importing all journeys from separate files in current directory...'
        );
        await importJourneysFromFiles({
          reUuid: options.reUuid,
          deps: options.deps,
        });
      }
      // import first journey in file
      else if (options.file && (await getTokens())) {
        printMessage('Importing first journey in file...');
        await importFirstJourneyFromFile(options.file, {
          reUuid: options.reUuid,
          deps: options.deps,
        });
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

program.parse();
