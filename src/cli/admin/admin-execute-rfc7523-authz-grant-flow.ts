import { frodo } from '@rockcarver/frodo-lib';
import { JwkRsa } from '@rockcarver/frodo-lib/types/ops/JoseOps.js';
import { Option } from 'commander';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import * as s from '../../help/SampleData';
import { executeRfc7523AuthZGrantFlow } from '../../ops/AdminOps.js';
import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand.js';

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

export default function setup() {
  const program = new FrodoCommand(
    'frodo admin execute-rfc7523-authz-grant-flow'
  );

  program
    .description('Execute RFC7523 authorization grant flow.')
    .addOption(new Option('--client-id [id]', 'Client id.'))
    .addOption(
      new Option(
        '--jwk-file [file]',
        'Path to JSON Web Key (JWK) file containing private key.'
      )
    )
    .addOption(
      new Option(
        '--sub [subject]',
        'Subject identifier, typically a UUID. Must resolve to a valid user in the realm.'
      )
    )
    .addOption(new Option('--iss [issuer]', 'Trusted issuer, typically a URL.'))
    .addOption(
      new Option('--scope [scope]', 'Space-delimited list of scopes.').default(
        'openid fr:am:* fr:idm:*'
      )
    )
    .addOption(new Option('--json', 'Output in JSON format.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  If you used frodo to create the RFC7523 configuration (see 'Related Commands' below), then you can test your configuration with minimal input and frodo will locate the missing parameters. The command below returns access token and identity token:\n` +
        `  $ frodo admin execute-rfc7523-authz-grant-flow --client-id rfc7523-client1 ${s.amBaseUrl}\n`[
          'brightCyan'
        ] +
        `  Same as above but output raw json:\n` +
        `  $ frodo admin execute-rfc7523-authz-grant-flow --client-id rfc7523-client1 --json ${s.amBaseUrl}'\n`[
          'brightCyan'
        ] +
        `  Same as first command above but explicitly provide all parameters:\n` +
        `  $ frodo admin execute-rfc7523-authz-grant-flow --client-id rfc7523-client1 --iss https://my-issuer.com/issuer --sub 146c2230-9448-4442-b86d-eb4a81a0121d --jwk-file rfc7523-client1_private.jwk.json ${s.amBaseUrl}'\n`[
          'brightCyan'
        ] +
        `\nRelated Commands:\n` +
        `  Run ${'frodo admin generate-rfc7523-authz-grant-artefacts --help'['brightCyan']} to see how to create the required configuration artefacts for ${'frodo admin execute-rfc7523-authz-grant-flow'['brightCyan']}:\n`
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
          printMessage(`Executing RFC7523 authorization grant flow...`);
          let clientId = uuidv4();
          if (options.clientId) {
            clientId = options.clientId;
          }
          let jwk: JwkRsa = undefined;
          if (options.jwkFile) {
            try {
              const data = fs.readFileSync(options.jwkFile);
              jwk = JSON.parse(data.toString());
            } catch (error) {
              printMessage(
                `Error parsing JWK from file ${options.jwkFile}: ${error.message}`,
                'error'
              );
            }
          }
          const outcome = await executeRfc7523AuthZGrantFlow(
            clientId,
            options.iss,
            jwk,
            options.sub,
            options.scope.split(' '),
            options.json
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
