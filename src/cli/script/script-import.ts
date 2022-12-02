import { Command, Option } from 'commander';
import { Authenticate, Script, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import { verboseMessage } from '../../utils/Console';

const { getTokens } = Authenticate;

const { importScriptsFromFile } = Script;
const { importExtractedScripts } = Script;

const program = new Command('frodo script import');

interface ScriptImportOptions extends common.CommonOptions {
  file?: string;
  scriptName?: string;
  /**
   * @deprecated
   */
  script?: string;
  reUuid?: boolean;
  extract: boolean;
}

program
  .description('Import scripts.')
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
  .addOption(
    new Option(
      '-x, --extract',
      'Use this option to import scripts that were previously extracted using the -x option.'
    ).default(false, 'false')
  )
  .action(
    // implement command logic inside action handler
    async (
      host: string,
      realm: string,
      user: string,
      password: string,
      options: ScriptImportOptions
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
        if (options.scriptName || options.script) {
          verboseMessage(
            `Importing script(s) into realm "${state.default.session.getRealm()}"...`
          );
          await importScriptsFromFile(
            options.scriptName || options.script,
            options.file,
            options.reUuid
          );
        } else if (options.extract) {
          verboseMessage(
            `Importing extracted script(s) into realm "${state.default.session.getRealm()}"...`
          );
          await importExtractedScripts();
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
