import { Command, Option } from 'commander';
import { Authenticate, Theme, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';

const { getTokens } = Authenticate;
const { listThemes } = Theme;

const program = new Command('frodo theme list');

program
  .description('List themes.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(
    new Option('-l, --long', 'Long with more fields.').default(false, 'false')
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
        console.log(
          `Listing themes in realm "${state.default.session.getRealm()}"...`
        );
        listThemes(options.long);
      }
    }
    // end command logic inside action handler
  );

program.parse();
