import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import { AuthenticateOps, state } from '@rockcarver/frodo-lib';

import { clientCredentialsGrant } from '../../api/OAuth2OIDCApi.js';

const { getTokens } = AuthenticateOps;

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
      if (await getTokens()) {
        console.log(
          `Getting an access token using client "${options.clientId}"...`
        );
        const response = (
          await clientCredentialsGrant(
            options.clientId,
            options.clientSecret,
            options.scope
          )
        ).data;
        console.log(`Token: ${response.access_token}`);
      }
    }
    // end command logic inside action handler
  );

program.parse();
