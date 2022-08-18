import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import { AuthenticateOps, state } from '@rockcarver/frodo-lib';

const { getTokens } = AuthenticateOps;

const program = new Command('frodo cmd sub1 import');

program
  .description('Sub1 import.')
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
      '-i, --sub1-id <sub1-id>',
      'Sub1 id. If specified, only one sub1 is imported and the options -a and -A are ignored.'
    )
  )
  .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
  .addOption(
    new Option(
      '-a, --all',
      'Import all sub1s from single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Import all sub1s from separate files (*.sub1.json) in the current directory. Ignored with -i or -a.'
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
        // code goes here
      }
    }
    // end command logic inside action handler
  );

program.parse();
