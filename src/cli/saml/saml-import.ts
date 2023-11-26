import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  importFirstSaml2ProviderFromFile,
  importSaml2ProviderFromFile,
  importSaml2ProvidersFromFile,
  importSaml2ProvidersFromFiles,
} from '../../ops/Saml2Ops';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo saml import');

program
  .description('Import SAML entity providers.')
  .addOption(
    new Option(
      '-i, --entity-id <entity-id>',
      'Entity id. If specified, only one provider is imported and the options -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '-f, --file <file>',
      'Name of the file to import the entity provider(s) from.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Import all entity providers from single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Import all entity providers from separate files (*.saml.json) in the current directory. Ignored with -i or -a.'
    )
  )
  .action(
    // implement program logic inside action handler
    async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      // import by id
      if (options.file && options.entityId && (await getTokens())) {
        verboseMessage(
          `Importing provider "${
            options.entityId
          }" into realm "${state.getRealm()}"...`
        );
        await importSaml2ProviderFromFile(options.entityId, options.file);
      }
      // --all -a
      else if (options.all && options.file && (await getTokens())) {
        verboseMessage(
          `Importing all providers from a single file (${options.file})...`
        );
        await importSaml2ProvidersFromFile(options.file);
      }
      // --all-separate -A
      else if (options.allSeparate && !options.file && (await getTokens())) {
        verboseMessage(
          'Importing all providers from separate files (*.saml.json) in current directory...'
        );
        await importSaml2ProvidersFromFiles();
      }
      // import first provider from file
      else if (options.file && (await getTokens())) {
        verboseMessage(
          `Importing first provider from file "${
            options.file
          }" into realm "${state.getRealm()}"...`
        );
        await importFirstSaml2ProviderFromFile(options.file);
      }
      // unrecognized combination of options or no options
      else {
        printMessage('Unrecognized combination of options or no options...');
        program.help();
        process.exitCode = 1;
      }
    }
    // end program logic inside action handler
  );

program.parse();
