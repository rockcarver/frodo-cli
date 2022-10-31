import { Command, Option } from 'commander';
import { Authenticate, Admin, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';
import { printMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { listNonOAuth2AdminStaticUserMappings } = Admin;

const program = new Command('frodo admin list-static-user-mappings');

program
  .description(
    'List all subjects of static user mappings that are not oauth2 clients.'
  )
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(
    new Option('--show-protected', 'Show protected (system) subjects.').default(
      false,
      'false'
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
        printMessage(
          'Listing all non-oauth2 client subjects of static user mappings...'
        );
        const subjects = await listNonOAuth2AdminStaticUserMappings(
          options.showProtected
        );
        subjects.sort((a, b) => a.localeCompare(b));
        subjects.forEach((item) => {
          printMessage(`${item}`);
        });
      }
    }
    // end command logic inside action handler
  );

program.parse();
