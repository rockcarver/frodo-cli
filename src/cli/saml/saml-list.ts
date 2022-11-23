import { Command, Option } from 'commander';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import { verboseMessage } from '../../utils/Console';
import { listRawSaml2Providers, listSaml2Providers } from '../../ops/Saml2Ops';

const { getTokens } = Authenticate;

const program = new Command('frodo saml list');

program
  .description('List SAML entity providers.')
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
    new Option('-l, --long', 'Long with all fields.').default(false, 'false')
  )
  .addOption(new Option('--raw', 'List raw entity providers.'))
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
        if (!options.raw) {
          verboseMessage(
            `Listing SAML entity providers in realm "${state.default.session.getRealm()}"...`
          );
          listSaml2Providers(options.long);
        } else {
          verboseMessage(
            `Listing raw SAML entity providers in realm "${state.default.session.getRealm()}"...`
          );
          listRawSaml2Providers();
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
