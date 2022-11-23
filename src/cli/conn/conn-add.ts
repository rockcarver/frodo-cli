import { Command, Option } from 'commander';
import { Authenticate, ConnectionProfile, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';

const { getTokens } = Authenticate;
const { saveConnectionProfile } = ConnectionProfile;

const program = new Command('frodo conn add');

program
  .description(
    'Add a new connection profiles. You have to specify a URL, username and password at a minimum.\nOptionally, for Identity Cloud, you can also add a log API key and secret.'
  )
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addArgument(common.apiKeyArgument)
  .addArgument(common.apiSecretArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(common.curlirizeOption)
  .addOption(new Option('--no-validate', 'Do not validate connection.'))
  .addOption(
    new Option(
      '--authentication-service [service]',
      'Name of the authentication service/tree to use.'
    )
  )
  .addOption(
    new Option(
      '--authentication-header-overrides [headers]',
      'Map of headers: {"host":"am.example.com:8081"}.'
    )
  )
  .action(
    // implement command logic inside action handler
    async (host, user, password, key, secret, options) => {
      state.default.session.setTenant(host);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setLogApiKey(key);
      state.default.session.setLogApiSecret(secret);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      if (options.authenticationService) {
        state.default.session.setAuthenticationService(
          options.authenticationService
        );
      }
      if (options.authenticationHeaderOverrides) {
        state.default.session.setAuthenticationHeaderOverrides(
          JSON.parse(options.authenticationHeaderOverrides)
        );
      }
      if ((options.validate && (await getTokens())) || !options.validate) {
        saveConnectionProfile();
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
