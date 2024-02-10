import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  importFirstOAuth2ClientFromFile,
  importOAuth2ClientFromFile,
  importOAuth2ClientsFromFile,
  importOAuth2ClientsFromFiles,
} from '../../ops/OAuth2ClientOps';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const program = new FrodoCommand('frodo oauth client import');

program
  .description('Import OAuth2 applications.')
  .addOption(
    new Option(
      '-i, --app-id <id>',
      'Application id. If specified, only one application is imported and the options -a and -A are ignored.'
    )
  )
  .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
  .addOption(
    new Option(
      '-a, --all',
      'Import all applications from single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Import all applications from separate files (*.app.json) in the current directory. Ignored with -i or -a.'
    )
  )
  .addOption(
    new Option('--no-deps', 'Do not include any dependencies (scripts).')
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
      // import by id
      if (options.file && options.appId && (await getTokens())) {
        verboseMessage(`Importing OAuth2 application "${options.appId}"...`);
        const status = await importOAuth2ClientFromFile(
          options.appId,
          options.file,
          {
            deps: options.deps,
          }
        );
        if (!status) process.exitCode = 1;
      }
      // --all -a
      else if (options.all && options.file && (await getTokens())) {
        verboseMessage(
          `Importing all OAuth2 applications from a single file (${options.file})...`
        );
        const status = await importOAuth2ClientsFromFile(options.file, {
          deps: options.deps,
        });
        if (!status) process.exitCode = 1;
      }
      // --all-separate -A
      else if (options.allSeparate && !options.file && (await getTokens())) {
        verboseMessage(
          'Importing all OAuth2 applications from separate files in current directory...'
        );
        const status = await importOAuth2ClientsFromFiles({
          deps: options.deps,
        });
        if (!status) process.exitCode = 1;
      }
      // import first provider from file
      else if (options.file && (await getTokens())) {
        verboseMessage(
          `Importing first OAuth2 application from file "${options.file}"...`
        );
        const status = await importFirstOAuth2ClientFromFile(options.file, {
          deps: options.deps,
        });
        if (!status) process.exitCode = 1;
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
