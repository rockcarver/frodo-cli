import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import { AuthenticateOps, AdminOps, state } from '@rockcarver/frodo-lib';

const { getTokens } = AuthenticateOps;
const { listNonOAuth2AdminStaticUserMappings } = AdminOps;

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
        console.log(
          'Listing all non-oauth2 client subjects of static user mappings...'
        );
        const subjects = await listNonOAuth2AdminStaticUserMappings(
          options.showProtected
        );
        subjects.sort((a, b) => a.localeCompare(b));
        subjects.forEach((item) => {
          console.log(`${item}`);
        });
      }
    }
    // end command logic inside action handler
  );

program.parse();
