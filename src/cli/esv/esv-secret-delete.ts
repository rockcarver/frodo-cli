import { Command, Option } from 'commander';
import { Authenticate, Secrets, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';
import { printMessage, verboseMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { deleteSecretCmd, deleteSecretsCmd } = Secrets;

const program = new Command('frodo esv secret delete');

program
  .description('Delete secrets.')
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
      '-i, --secret-id <secret-id>',
      'Secret id. If specified, -a is ignored.'
    )
  )
  .addOption(
    new Option('-a, --all', 'Delete all secrets in a realm. Ignored with -i.')
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
      // delete by id
      if (options.secretId && (await getTokens())) {
        verboseMessage('Deleting secret...');
        deleteSecretCmd(options.secretId);
      }
      // --all -a
      else if (options.all && (await getTokens())) {
        verboseMessage('Deleting all secrets...');
        deleteSecretsCmd();
      }
      // unrecognized combination of options or no options
      else {
        printMessage('Unrecognized combination of options or no options...');
        program.help();
      }
    }
    // end command logic inside action handler
  );

program.parse();
