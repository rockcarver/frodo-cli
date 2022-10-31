import { Command, Option } from 'commander';
import { Authenticate, Secrets, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';
import { printMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { deleteVersionOfSecretCmd } = Secrets;

const program = new Command('frodo esv secret version delete');

program
  .description('Delete versions of secrets.')
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
      '-i, --secret-id <secret-id>',
      'Secret id. If specified, -a is ignored.'
    )
  )
  .addOption(new Option('-v, --version <version>', 'Version of secret.'))
  .addOption(
    new Option('-a, --all', 'Delete all secrets in a realm. Ignored with -i.')
  )
  .addOption(
    new Option(
      '--verbose',
      'Verbose output during command execution. If specified, may or may not produce additional output.'
    ).default(false, 'off')
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
        // delete by id
        if (options.secretId && options.version) {
          printMessage(`Deleting version of secret...`);
          deleteVersionOfSecretCmd(options.secretId, options.version);
        }
        // --all -a
        // else if (options.all) {
        //   printMessage('Deleting all versions...');
        //   deleteJourneys(options);
        // }
        // unrecognized combination of options or no options
        else {
          printMessage('Unrecognized combination of options or no options...');
          program.help();
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
