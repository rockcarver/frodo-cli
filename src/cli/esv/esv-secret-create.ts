import { Command, Option } from 'commander';
import { Authenticate, Secrets, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';
import { verboseMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { createSecret } = Secrets;

const program = new Command('frodo esv secret create');

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
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(common.curlirizeOption)
  .requiredOption('-i, --secret-id <secret-id>', 'Secret id.')
  .requiredOption('--value <value>', 'Secret value.')
  .option('--description [description]', 'Secret description.')
  .addOption(
    new Option(
      '--encoding [encoding]',
      'Secret encoding. Must be one of "generic", "pem", "base64hmac"'
    ).default('generic', 'generic')
  )
  .addOption(
    new Option(
      '--no-use-in-placeholders',
      'Secret cannot be used in placeholders.'
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
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      if (await getTokens()) {
        verboseMessage('Creating secret...');
        createSecret(
          options.secretId,
          options.value,
          options.description,
          options.encoding,
          options.useInPlaceholders
        );
      }
    }
    // end command logic inside action handler
  );

program.parse();
