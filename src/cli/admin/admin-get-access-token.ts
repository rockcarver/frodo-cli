import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
];
const { clientCredentialsGrant } = frodo.oauth2oidc.endpoint;
export default function setup() {
  const program = new FrodoCommand(
    'frodo admin get-access-token',
    [],
    deploymentTypes
  );

  program
    .description('Get an access token using client credentials grant type.')
    .addOption(
      new Option('-i, --client-id [id]', 'Client id.').makeOptionMandatory()
    )
    .addOption(
      new Option(
        '-s, --client-secret [secret]',
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
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        if (await getTokens(false, true, deploymentTypes)) {
          printMessage(
            `Getting an access token using client "${options.clientId}"...`
          );
          const response = await clientCredentialsGrant(
            state.getHost(),
            options.clientId,
            options.clientSecret,
            options.scope
          );
          printMessage(`Token: ${response.access_token}`);
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
