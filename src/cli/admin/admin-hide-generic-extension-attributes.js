import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import { AuthenticateOps, AdminOps, state } from '@rockcarver/frodo-lib';

const { getTokens } = AuthenticateOps;
const { hideGenericExtensionAttributes } = AdminOps;

const program = new Command('frodo admin hide-generic-extension-attributes');

program
  .description('Hide generic extension attributes.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(
    new Option('--include-customized', 'Include customized attributes.')
  )
  .addOption(new Option('--dry-run', 'Dry-run only, do not perform changes.'))
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
          `Hiding generic extension attributes in realm "${state.default.session.getRealm()}"...`
        );
        await hideGenericExtensionAttributes(
          options.includeCustomized,
          options.dryRun
        );
        console.log('Done.');
      }
    }
    // end command logic inside action handler
  );

program.parse();
