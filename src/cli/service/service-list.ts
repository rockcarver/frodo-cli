import { Authenticate, state } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import { listServices } from '../../ops/ServiceOps.js';
import { verboseMessage } from '../../utils/Console.js';
import * as common from '../cmd_common.js';

const { getTokens } = Authenticate;

const program = new Command('frodo service list');

program
  .description('List AM services.')
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
    new Option('-l, --long', 'Long with all fields.').default(false, 'false')
  )
  .addOption(new Option('-g, --global', 'List global services.'))
  .action(async (host, realm, user, password, options) => {
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
      verboseMessage(`Listing all AM services for realm: ${realm}`);
      await listServices(options.long, options.global);
    }
  });

program.parse();
