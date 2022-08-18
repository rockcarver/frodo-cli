import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import { AuthenticateOps, OAuth2ClientOps, state } from '@rockcarver/frodo-lib';

const { getTokens } = AuthenticateOps;
const {
  exportOAuth2ClientsToFile,
  exportOAuth2ClientsToFiles,
  exportOAuth2ClientToFile,
} = OAuth2ClientOps;

const program = new Command('frodo app export');

program
  .description('Export OAuth2 applications.')
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
    async (host, realm, user, password, options) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      if (await getTokens()) {
        // export
        if (options.appId) {
          console.log('Exporting OAuth2 application...');
          exportOAuth2ClientToFile(options.appId, options.file);
        }
        // -a/--all
        else if (options.all) {
          console.log('Exporting all OAuth2 applications to file...');
          exportOAuth2ClientsToFile(options.file);
        }
        // -A/--all-separate
        else if (options.allSeparate) {
          console.log('Exporting all applications to separate files...');
          exportOAuth2ClientsToFiles();
        }
        // unrecognized combination of options or no options
        else {
          console.log('Unrecognized combination of options or no options...');
          program.help();
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
