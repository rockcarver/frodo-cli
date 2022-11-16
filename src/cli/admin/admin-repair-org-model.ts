import { Command, Option } from 'commander';
import { Authenticate, Admin, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';
import { printMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { repairOrgModel } = Admin;

const program = new Command('frodo admin repair-org-model');

program
  .description('Repair org model.')
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
  .addOption(
    new Option(
      '--exclude-customized',
      'Exclude customized properties from repair.'
    )
  )
  .addOption(
    new Option(
      '--extend-permissions',
      'Extend permissions to include custom attributes.'
    )
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
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      if (await getTokens()) {
        printMessage(
          `Repairing org model in realm "${state.default.session.getRealm()}"...`
        );
        await repairOrgModel(
          options.excludeCustomized,
          options.extendPermissions,
          options.dryRun
        );
        printMessage('Done.');
      }
    }
    // end command logic inside action handler
  );

program.parse();
