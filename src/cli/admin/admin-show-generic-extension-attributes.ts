import { Command, Option } from 'commander';
import { Authenticate, Admin, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';
import { printMessage } from '../../utils/Console.js';

const { showGenericExtensionAttributes } = Admin;
const { getTokens } = Authenticate;

const program = new Command('frodo admin show-generic-extension-attributes');

program
  .description('Show generic extension attributes.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(
    new Option(
      '--include-customized',
      'Include customized attributes.'
    ).default(false, 'false')
  )
  .addOption(
    new Option('--dry-run', 'Dry-run only, do not perform changes.').default(
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
          `Showing generic extension attributes in realm "${state.default.session.getRealm()}"...`
        );
        await showGenericExtensionAttributes(
          options.includeCustomized,
          options.dryRun
        );
        printMessage('Done.');
      }
    }
    // end command logic inside action handler
  );

program.parse();
