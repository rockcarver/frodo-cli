import { Command } from 'commander';
import { Authenticate, Variables, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';
import { verboseMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { createVariable } = Variables;

const program = new Command('frodo esv variable create');

program
  .description('Create variables.')
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
  .requiredOption('-i, --variable-id <variable-id>', 'Variable id.')
  .requiredOption('--value <value>', 'Secret value.')
  .option('--description [description]', 'Secret description.')
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
        verboseMessage('Creating variable...');
        createVariable(options.variableId, options.value, options.description);
      }
    }
    // end command logic inside action handler
  );

program.parse();
