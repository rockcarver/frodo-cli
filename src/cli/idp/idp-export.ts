import { Command, Option } from 'commander';
import { Authenticate, Idp, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import { printMessage, verboseMessage } from '../../utils/Console';

const { getTokens } = Authenticate;
const {
  exportSocialProviderToFile,
  exportSocialProvidersToFile,
  exportSocialProvidersToFiles,
} = Idp;

const program = new Command('frodo idp export');

program
  .description('Export (social) identity providers.')
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
      '-i, --idp-id <idp-id>',
      'Id/name of a provider. If specified, -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '-f, --file [file]',
      'Name of the file to write the exported provider(s) to. Ignored with -A.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Export all the providers in a realm to a single file. Ignored with -t and -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all the providers in a realm as separate files <provider name>.idp.json. Ignored with -t, -i, and -a.'
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
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      if (await getTokens()) {
        // export by id/name
        if (options.idpId) {
          verboseMessage(
            `Exporting provider "${
              options.idpId
            }" from realm "${state.default.session.getRealm()}"...`
          );
          exportSocialProviderToFile(options.idpId, options.file);
        }
        // --all -a
        else if (options.all) {
          verboseMessage('Exporting all providers to a single file...');
          exportSocialProvidersToFile(options.file);
        }
        // --all-separate -A
        else if (options.allSeparate) {
          verboseMessage('Exporting all providers to separate files...');
          exportSocialProvidersToFiles();
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
    }
    // end command logic inside action handler
  );

program.parse();
