import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import { AuthenticateOps, SecretsOps, state } from '@rockcarver/frodo-lib';

const { getTokens } = AuthenticateOps;
const { setDescriptionOfSecret } = SecretsOps;

const program = new Command('frodo esv secret set');

program
  .description('Create secrets.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(new Option('-i, --secret-id <secret-id>', 'Secret id.'))
  .addOption(new Option('--description <description>', 'Secret description.'))
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
        console.log('Setting secret description...');
        setDescriptionOfSecret(options.secretId, options.description);
      }
    }
    // end command logic inside action handler
  );

program.parse();
