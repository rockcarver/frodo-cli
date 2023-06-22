import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console';
import {
  importAdminFederationProviderFromFile,
  importAdminFederationProvidersFromFile,
  importAdminFederationProvidersFromFiles,
  importFirstAdminFederationProviderFromFile,
} from '../../ops/AdminFederationOps';

const { getTokens } = Authenticate;

const program = new FrodoCommand('frodo admin federation import', ['realm']);

program
  .description('Import admin federation providers.')
  .addOption(
    new Option(
      '-i, --idp-id <id>',
      'Provider id. If specified, -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '-f, --file <file>',
      'Name of the file to import the provider(s) from.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Import all the providers from single file. Ignored with -t or -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Import all the providers from separate files (*.admin.federation.json) in the current directory. Ignored with -t or -i or -a.'
    )
  )
  .action(
    // implement command logic inside action handler
    async (host, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(host, user, password, options, command);
      // import by id
      if (options.file && options.idpId && (await getTokens(true))) {
        verboseMessage(`Importing provider "${options.idpId}"...`);
        const outcome = await importAdminFederationProviderFromFile(
          options.idpId,
          options.file
        );
        if (!outcome) process.exitCode = 1;
      }
      // --all -a
      else if (options.all && options.file && (await getTokens(true))) {
        verboseMessage(
          `Importing all providers from a single file (${options.file})...`
        );
        const outcome = await importAdminFederationProvidersFromFile(
          options.file
        );
        if (!outcome) process.exitCode = 1;
      }
      // --all-separate -A
      else if (
        options.allSeparate &&
        !options.file &&
        (await getTokens(true))
      ) {
        verboseMessage(
          'Importing all providers from separate files in current directory...'
        );
        const outcome = await importAdminFederationProvidersFromFiles();
        if (!outcome) process.exitCode = 1;
      }
      // import first provider from file
      else if (options.file && (await getTokens(true))) {
        verboseMessage(
          `Importing first provider from file "${options.file}"...`
        );
        const outcome = await importFirstAdminFederationProviderFromFile(
          options.file
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

program.parse();
