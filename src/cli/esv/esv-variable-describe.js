import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import { AuthenticateOps, VariablesOps, state } from '@rockcarver/frodo-lib';

const { getTokens } = AuthenticateOps;
const { describeVariable } = VariablesOps;

const program = new Command('frodo esv variable describe');

program
  .description('Describe variables.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(new Option('-i, --variable-id <variable-id>', 'Variable id.'))
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
        console.log(`Describing variable ${options.variableId}...`);
        describeVariable(options.variableId);
      }
    }
    // end command logic inside action handler
  );

program.parse();
