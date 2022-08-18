import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import { AuthenticateOps, ScriptOps , state } from '@rockcarver/frodo-lib'
const { getTokens } = AuthenticateOps;


import {
  exportScriptByName,
  exportScriptsToFile,
  exportScriptsToFiles,
} from ScriptOps;

const program = new Command('frodo script export');

program
  .description('Export scripts.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(
    new Option(
      '-n, --script-name <name>',
      'Name of the script. If specified, -a and -A are ignored.'
    )
  )
  // .addOption(
  //   new Option(
  //     '-i, --script-id <uuid>',
  //     'Uuid of the script. If specified, -a and -A are ignored.'
  //   )
  // )
  .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
  .addOption(
    new Option(
      '-a, --all',
      'Export all cmds to a single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all cmds to separate files (*.cmd.json) in the current directory. Ignored with -i or -a.'
    )
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
    async (host, realm, user, password, options) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      if (await getTokens()) {
        // export by name
        if (options.scriptName || options.script) {
          console.log('Exporting script...');
          exportScriptByName(
            options.scriptName || options.script,
            options.file
          );
        }
        // -a / --all
        else if (options.all) {
          console.log('Exporting all scripts to a single file...');
          exportScriptsToFile(options.file);
        }
        // -A / --all-separate
        else if (options.allSeparate) {
          console.log('Exporting all scripts to separate files...');
          exportScriptsToFiles();
        }
        // unrecognized combination of options or no options
        else {
          console.log(
            'Unrecognized combination of options or no options...',
            'error'
          );
          program.help();
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
