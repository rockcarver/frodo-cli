import { Command } from 'commander';
import { Authenticate, Admin, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';
import { printMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { addAutoIdStaticUserMapping } = Admin;

const program = new Command('frodo admin add-autoid-static-user-mapping');

program
  .description(
    'Add AutoId static user mapping to enable dashboards and other AutoId-based functionality.'
  )
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
        printMessage(`Adding AutoId static user mapping...`);
        await addAutoIdStaticUserMapping();
        printMessage('Done.');
      }
    }
    // end command logic inside action handler
  );

program.parse();
