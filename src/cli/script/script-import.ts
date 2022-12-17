import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, Script, state } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console';

const { getTokens } = Authenticate;

const { importScriptsFromFile } = Script;

const program = new FrodoCommand('frodo script import');

program
  .description('Import scripts.')
  .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
  .addOption(
    new Option(
      '-n, --script-name <name>',
      'Name of the script. If specified, -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '--re-uuid',
      'Re-UUID. Create a new UUID for the script upon import. Use this to duplicate a script or create a new version of the same script. Note that you must also choose a new name using -n/--script-name to avoid import errors.'
    ).default(false, 'false')
  )
  // deprecated option
  .addOption(
    new Option(
      '-s, --script <script>',
      'DEPRECATED! Use -n/--script-name instead. Name of the script.'
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
      if (await getTokens()) {
        verboseMessage(
          `Importing script(s) into realm "${state.getRealm()}"...`
        );
        importScriptsFromFile(
          options.scriptName || options.script,
          options.file,
          options.reUuid
        );
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
