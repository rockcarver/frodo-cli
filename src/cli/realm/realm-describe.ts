import { Command } from 'commander';
import { Authenticate, Realm, Utils, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import { verboseMessage } from '../../utils/Console';

const { getRealmName } = Utils;
const { getTokens } = Authenticate;
const { describe } = Realm;

const program = new Command('frodo realm describe');

program
  .description('Describe realms.')
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
  .action(
    // implement command logic inside action handler
    async (host, realm, user, password, options) => {
      state.setHost(host);
      state.setRealm(realm);
      state.setUsername(user);
      state.setPassword(password);
      state.setDeploymentType(options.type);
      state.setAllowInsecureConnection(options.insecure);
      state.setVerbose(options.verbose);
      state.setDebug(options.debug);
      state.setCurlirize(options.curlirize);
      if (await getTokens()) {
        verboseMessage(`Retrieving details of realm ${state.getRealm()}...`);
        describe(getRealmName(state.getRealm()));
      }
    }
    // end command logic inside action handler
  );

program.parse();
