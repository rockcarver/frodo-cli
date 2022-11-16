import { Command, Option } from 'commander';
import { Authenticate, OAuth2OIDCApi, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';
import { printMessage } from '../../utils/Console.js';

const { clientCredentialsGrant } = OAuth2OIDCApi;
const { getTokens } = Authenticate;

const program = new Command('frodo admin get-access-token');

program
  .description('Get an access token using client credentials grant type.')
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
  .addOption(new Option('--client-id [id]', 'Client id.').makeOptionMandatory())
  .addOption(
    new Option(
      '--client-secret [secret]',
      'Client secret.'
    ).makeOptionMandatory()
  )
  .addOption(
    new Option('--scope [scope]', 'Request the following scope(s).').default(
      'fr:idm:*',
      'fr:idm:*'
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
        printMessage(
          `Getting an access token using client "${options.clientId}"...`
        );
        const response = (
          await clientCredentialsGrant(
            options.clientId,
            options.clientSecret,
            options.scope
          )
        ).data;
        printMessage(`Token: ${response.access_token}`);
      }
    }
    // end command logic inside action handler
  );

program.parse();
