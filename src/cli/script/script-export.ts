import { Command, Option } from 'commander';
import { Authenticate, Script, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import { printMessage, verboseMessage } from '../../utils/Console';

const { getTokens } = Authenticate;
const { exportScriptByName } = Script;
const { exportScriptsToFile } = Script;
const { exportScriptsToFiles } = Script;
const { exportScriptsExtract } = Script;

const program = new Command('frodo script export');

interface ScriptExportOptions extends common.CommonOptions {
  scriptName?: string;
  file?: string;
  all?: boolean;
  allSeparate?: boolean;
  /**
   * @deprecated
   */
  script?: string;
  extract: boolean;
}

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
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(common.curlirizeOption)
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
      'Export all scripts to a single file. Ignored with -n.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all scripts to separate files (*.script.json) in the current directory. Ignored with -n or -a.'
    )
  )
  // deprecated option
  .addOption(
    new Option(
      '-s, --script <script>',
      'DEPRECATED! Use -n/--script-name instead. Name of the script.'
    )
  )
  .addOption(
    new Option(
      '-x, --extract',
      'Extract the script from the exported file, and save it to a separate file. Ignored with -n or -a.'
    )
  )
  .action(
    // implement command logic inside action handler
    async (
      host: string,
      realm: string,
      user: string,
      password: string,
      options: ScriptExportOptions
    ) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);

      if (await getTokens()) {
        // export by name
        if (options.scriptName || options.script) {
          verboseMessage('Exporting script...');
          await exportScriptByName(
            options.scriptName || options.script,
            options.file
          );
        }
        // -a / --all
        else if (options.all) {
          verboseMessage('Exporting all scripts to a single file...');
          await exportScriptsToFile(options.file);
        }
        // -A / --all-separate
        else if (options.allSeparate) {
          verboseMessage('Exporting all scripts to separate files...');
          await exportScriptsToFiles();
        }
        // -j / --js
        else if (options.extract) {
          verboseMessage('Exporting all scripts as js files...');
          await exportScriptsExtract();
        }
      }
      // unrecognized combination of options or no options
      else {
        printMessage(
          'Unrecognized combination of options or no options...',
          'error'
        );
        program.help();
      }
    }
    // end command logic inside action handler
  );

program.parse();
