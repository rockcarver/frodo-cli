import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, OAuth2Client } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const {
  exportOAuth2ClientsToFile,
  exportOAuth2ClientsToFiles,
  exportOAuth2ClientToFile,
} = OAuth2Client;

const program = new FrodoCommand('frodo app export');

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
        exportOAuth2ClientToFile(options.appId, options.file);
      }
      // -a/--all
      else if (options.all && (await getTokens())) {
        verboseMessage('Exporting all OAuth2 applications to file...');
        exportOAuth2ClientsToFile(options.file);
      }
      // -A/--all-separate
      else if (options.allSeparate && (await getTokens())) {
        verboseMessage('Exporting all applications to separate files...');
        exportOAuth2ClientsToFiles();
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
