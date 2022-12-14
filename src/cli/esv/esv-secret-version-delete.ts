import { Command, Option } from 'commander';
import { Authenticate, Secrets, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';
import { printMessage, verboseMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { deleteVersionOfSecretCmd } = Secrets;

const program = new Command('frodo esv secret version delete');

program
  .description('Delete versions of secrets.')
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
    new Option(
      '-i, --secret-id <secret-id>',
      'Secret id. If specified, -a is ignored.'
    )
  )
  .addOption(new Option('-v, --version <version>', 'Version of secret.'))
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
      if (options.secretId && options.version && (await getTokens())) {
        verboseMessage(`Deleting version of secret...`);
        deleteVersionOfSecretCmd(options.secretId, options.version);
      }
      // --all -a
      // else if (options.all && (await getTokens())) {
      //   printMessage('Deleting all versions...');
      //   deleteJourneys(options);
      // }
      // unrecognized combination of options or no options
      else {
        printMessage('Unrecognized combination of options or no options...');
        program.help();
      }
    }
    // end command logic inside action handler
  );

program.parse();
