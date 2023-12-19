import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  exportOAuth2ClientsToFile,
  exportOAuth2ClientsToFiles,
  exportOAuth2ClientToFile,
} from '../../ops/OAuth2ClientOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo oauth client export');

program
  .description('Export OAuth2 applications.')
  .addOption(
    new Option(
      '-i, --app-id <app-id>',
      'App id. If specified, -a and -A are ignored.'
    )
  )
  .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
  .addOption(
    new Option(
      '-a, --all',
      'Export all OAuth2 apps to a single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all OAuth2 apps to separate files (*.oauth2.app.json) in the current directory. Ignored with -i or -a.'
    )
  )
  .addOption(
    new Option(
      '-N, --no-metadata',
      'Does not include metadata in the export file.'
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
      // export
      if (options.appId && (await getTokens())) {
        verboseMessage('Exporting OAuth2 application...');
        const status = await exportOAuth2ClientToFile(
          options.appId,
          options.file,
          options.metadata,
          {
            useStringArrays: true,
            deps: options.deps,
          }
        );
        if (!status) process.exitCode = 1;
      }
      // -a/--all
      else if (options.all && (await getTokens())) {
        verboseMessage('Exporting all OAuth2 applications to file...');
        const status = await exportOAuth2ClientsToFile(
          options.file,
          options.metadata,
          {
            useStringArrays: true,
            deps: options.deps,
          }
        );
        if (!status) process.exitCode = 1;
      }
      // -A/--all-separate
      else if (options.allSeparate && (await getTokens())) {
        verboseMessage('Exporting all applications to separate files...');
        const status = await exportOAuth2ClientsToFiles(options.metadata, {
          useStringArrays: true,
          deps: options.deps,
        });
        if (!status) process.exitCode = 1;
      }
      // unrecognized combination of options or no options
      else {
        verboseMessage('Unrecognized combination of options or no options...');
        program.help();
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
