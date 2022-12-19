import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate, OAuth2OIDCApi } from '@rockcarver/frodo-lib';
import { printMessage } from '../../utils/Console.js';

const { clientCredentialsGrant } = OAuth2OIDCApi;
const { getTokens } = Authenticate;

const program = new FrodoCommand('frodo admin get-access-token');

program
  .description('Get an access token using client credentials grant type.')
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
    async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
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
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
