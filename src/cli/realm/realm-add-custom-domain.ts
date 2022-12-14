import { Command, Option } from 'commander';
import { Authenticate, Realm, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import { verboseMessage } from '../../utils/Console';

const { getTokens } = Authenticate;
const { addCustomDomain } = Realm;

const program = new Command('frodo realm add-custom-domain');

program
  .description('Add custom domain (realm DNS alias).')
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
  .addOption(
    new Option(
      '-d, --domain <name>',
      'Custom DNS domain name.'
    ).makeOptionMandatory()
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
        verboseMessage(
          `Adding custom DNS domain ${
            options.domain
          } to realm ${state.default.session.getRealm()}...`
        );
        await addCustomDomain(state.default.session.getRealm(), options.domain);
      }
    }
    // end command logic inside action handler
  );

program.parse();
