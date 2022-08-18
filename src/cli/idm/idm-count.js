import { Command, Option } from 'commander';
import { Authenticate, Idm, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';

const { getTokens } = Authenticate;
const { countManagedObjects } = Idm;

const program = new Command('frodo idm count');

program
  .description('Count managed objects.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.insecureOption)
  .addOption(
    new Option(
      '-m, --managed-object <type>',
      'Type of managed object to count. E.g. "alpha_user", "alpha_role", "user", "role".'
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
        console.log(`Counting managed ${options.managedObject} objects...`);
        countManagedObjects(options.managedObject);
      }
    }
    // end command logic inside action handler
  );

program.parse();
