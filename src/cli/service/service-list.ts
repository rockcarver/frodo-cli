import { Authenticate, Service, state } from '@rockcarver/frodo-lib';
import { Command } from 'commander';
import * as common from '../cmd_common.js';

const { getTokens } = Authenticate;
const { listServices } = Service;

const program = new Command('frodo service list');

program
  .description('List Service objects.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .action(async (host, realm, user, password, options) => {
    state.default.session.setTenant(host);
    state.default.session.setRealm(realm);
    state.default.session.setUsername(user);
    state.default.session.setPassword(password);
    state.default.session.setDeploymentType(options.type);
    state.default.session.setAllowInsecureConnection(options.insecure);
    if (await getTokens()) {
      console.log(`Listing all service objects for realm: ${realm}`);
      await listServices();
    }
  });

program.parse();
