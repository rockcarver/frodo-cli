import { Command } from 'commander';
import { Authenticate, Idp, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import { verboseMessage } from '../../utils/Console';

const { getTokens } = Authenticate;
const { listSocialProviders } = Idp;

const program = new Command('frodo idp list');

program
  .description('List (social) identity providers.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgument)
  .addArgument(common.realmArgument)
  .addArgument(common.usernameArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(common.curlirizeOption)
  // .addOption(
  //   new Option('-l, --long', 'Long with all fields.').default(false, 'false')
  // )
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
        verboseMessage(
          `Listing providers in realm "${state.default.session.getRealm()}"...`
        );
        listSocialProviders();
      }
    }
    // end command logic inside action handler
  );

program.parse();
