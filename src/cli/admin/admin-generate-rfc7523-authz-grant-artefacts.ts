import { frodo, state } from '@rockcarver/frodo-lib';
import { JwkRsa } from '@rockcarver/frodo-lib/types/ops/JoseOps.js';
import { Option } from 'commander';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import * as s from '../../help/SampleData';
import { generateRfc7523AuthZGrantArtefacts } from '../../ops/AdminOps.js';
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
    'frodo admin generate-rfc7523-authz-grant-artefacts',
    [],
    deploymentTypes
  );

  program
    .description('Generate RFC7523 authorization grant artefacts.')
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
        'Subject identifier, typically a UUID. Must resolve to a valid user in the realm. Restricts the trusted issuer to only this subject by adding the identifier to the list of allowed subjects. Omitting this option allows the trusted issuer to request tokens for any realm user without restrictions.'
      )
    )
    .addOption(new Option('--iss [issuer]', 'Trusted issuer, typically a URL.'))
    .addOption(
      new Option('--scope [scope]', 'Space-delimited list of scopes.').default(
        'openid fr:am:* fr:idm:*'
      )
    )
    .addOption(
      new Option(
        '--no-save',
        'Do not save artefacts in AM and to file By default this command creates a fully configured oauth2 client and trusted issuer in AM and saves the generated JWK (private key) and JWKS (public key set) to files.'
      )
    )
    .addOption(new Option('--json', 'Output in JSON format.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Generate, output to console, and save all the artefacts for an RFC7523 authorization grant flow configuration limited to one particular subject:\n` +
        `  - Fully configured OAuth2 client - named '<clientId>'\n` +
        `  - Fully configured OAuth2 trusted issuer - named '<clientId>-issuer'\n` +
        `  - Private Key as Json Web Key (JWK) - named '<clientId>_private.jwk.json'\n` +
        `  - Public Key as Json Web Key Set (JWKS) - named '<clientId>_public.jwks.json'\n` +
        `  $ frodo admin generate-rfc7523-authz-grant-artefacts --client-id rfc7523-client1 --iss https://my-issuer.com/issuer --sub 146c2230-9448-4442-b86d-eb4a81a0121d ${s.amBaseUrl}\n`[
          'brightCyan'
        ] +
        `  Same as above but use an existing JWK file instead of creating one.\n` +
        `  $ frodo admin generate-rfc7523-authz-grant-artefacts --client-id rfc7523-client1 --iss https://my-issuer.com/issuer --sub 146c2230-9448-4442-b86d-eb4a81a0121d --jwk-file rfc7523-client1_private.jwk.json ${s.amBaseUrl}\n`[
          'brightCyan'
        ] +
        `  Generate and output to console all the artefacts for an RFC7523 authorization grant flow configuration but do not create any configuration or files.\n` +
        `  $ frodo admin generate-rfc7523-authz-grant-artefacts --client-id rfc7523-client1 --iss https://my-issuer.com/issuer --sub 146c2230-9448-4442-b86d-eb4a81a0121d --no-save ${s.amBaseUrl}\n`[
          'brightCyan'
        ] +
        `  Generate and output in json format all the artefacts for an RFC7523 authorization grant flow configuration.\n` +
        `  $ frodo admin generate-rfc7523-authz-grant-artefacts --client-id rfc7523-client1 --iss https://my-issuer.com/issuer --sub 146c2230-9448-4442-b86d-eb4a81a0121d --json ${s.amBaseUrl}\n`[
          'brightCyan'
        ] +
        `\nRelated Commands:\n` +
        `  Run ${'frodo admin execute-rfc7523-authz-grant-flow --help'['brightCyan']} to see how to test your configuration created with ${'frodo admin generate-rfc7523-authz-grant-artefacts'['brightCyan']}:\n`
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
            `Generating RFC7523 authorization grant artefacts in realm "${state.getRealm()}"...`
          );
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
          const outcome = await generateRfc7523AuthZGrantArtefacts(
            clientId,
            options.iss,
            jwk,
            options.sub,
            options.scope.split(' '),
            { save: options.save },
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
