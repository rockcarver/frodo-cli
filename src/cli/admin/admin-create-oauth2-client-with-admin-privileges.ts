import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { v4 as uuidv4 } from 'uuid';
import { createOAuth2ClientWithAdminPrivileges } from '../../ops/AdminOps';
import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage } from '../../utils/Console.js';
import { FrodoCommand, SecretOption } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo admin create-oauth2-client-with-admin-privileges',
    [],
    deploymentTypes
  );

  program
    .description('Create an oauth2 client with admin privileges.')
    .addOption(new Option('--client-id <id>', 'Client id.'))
    .addOption(new SecretOption('--client-secret [secret]', 'Client secret.'))
    .addOption(
      new Option(
        '--llt',
        'Create a long-lived token and store it in a secret. The default secret name is esv-admin-token and the default token lifetime is 315,360,000 seconds (10 years). Both can be overwritten with the --llt-esv and --llt-ttl options.'
      )
    )
    .addOption(
      new Option(
        '--llt-scope <scope>',
        'Request the following scope(s). This option only applies if used with the --llt option.'
      ).default('fr:idm:*', 'fr:idm:*')
    )
    .addOption(
      new Option(
        '--llt-esv <esv>',
        'Name of the secret to store the token in. This option only applies if used with the --llt option.'
      ).default('esv-admin-token', 'esv-admin-token')
    )
    .addOption(
      new Option(
        '--no-llt-esv',
        "Don't store the token in a secret and output to console instead. This option only applies if used with the --llt option."
      )
    )
    .addOption(
      new Option(
        '--llt-ttl <ttl>',
        'Token lifetime (seconds). This option only applies if used with the --llt option.'
      ).default(315360000, '315,360,000 seconds (10 years)')
    )
    .multiOp()
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
            `Creating oauth2 client with admin privileges in realm "${state.getRealm()}"...`
          );
          let clientId = uuidv4();
          let clientSecret = uuidv4();
          if (options.clientId) {
            clientId = options.clientId;
          }
          if (options.clientSecret) {
            clientSecret = options.clientSecret;
          }
          const outcome = await createOAuth2ClientWithAdminPrivileges(
            clientId,
            clientSecret,
            options.llt
              ? {
                  scope: options.lltScope,
                  // --no-llt-esv: the token is output instead of stored
                  esv: options.lltEsv || undefined,
                  ttl: options.lltTtl,
                }
              : undefined,
            options.allowFailures
          );
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
