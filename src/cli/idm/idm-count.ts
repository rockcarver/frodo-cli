import { Command, Option } from 'commander';
import { Authenticate, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common';
import { verboseMessage } from '../../utils/Console';
import { countManagedObjects } from '../../ops/IdmOps';

const { getTokens } = Authenticate;

const program = new Command('frodo idm count');

program
  .description('Count managed objects.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgument)
  .addArgument(common.realmArgument)
  .addArgument(common.usernameArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.insecureOption)
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(common.curlirizeOption)
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
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      if (await getTokens()) {
        verboseMessage(`Counting managed ${options.managedObject} objects...`);
        countManagedObjects(options.managedObject);
      }
    }
    // end command logic inside action handler
  );

program.parse();
