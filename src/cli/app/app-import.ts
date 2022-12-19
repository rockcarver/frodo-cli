import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, OAuth2Client } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { importOAuth2ClientsFromFile } = OAuth2Client;

const program = new FrodoCommand('frodo app import');

program
  .description('Import OAuth2 applications.')
  // .addOption(
  //   new Option(
  //     '-i, --cmd-id <cmd-id>',
  //     'Cmd id. If specified, only one cmd is imported and the options -a and -A are ignored.'
  //   )
  // )
  .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
  // .addOption(
  //   new Option(
  //     '-a, --all',
  //     'Import all cmds from single file. Ignored with -i.'
  //   )
  // )
  // .addOption(
  //   new Option(
  //     '-A, --all-separate',
  //     'Import all cmds from separate files (*.cmd.json) in the current directory. Ignored with -i or -a.'
  //   )
  // )
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
      if (await getTokens()) {
        verboseMessage(`Importing OAuth2 application(s) ...`);
        importOAuth2ClientsFromFile(options.file);
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
