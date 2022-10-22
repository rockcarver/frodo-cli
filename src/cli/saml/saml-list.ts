import { Command, Option } from 'commander';
import { Authenticate, Saml2, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import { printMessage } from '../../utils/Console';

const { getTokens } = Authenticate;
const { listSaml2Providers } = Saml2;

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
  .addOption(
    new Option('-l, --long', 'Long with all fields.').default(false, 'false')
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
        printMessage(
          `Listing SAML entity providers in realm "${state.default.session.getRealm()}"...`
        );
        listSaml2Providers(options.long);
      }
    }
    // end command logic inside action handler
  );

program.parse();
