import { frodo, state } from '@rockcarver/frodo-lib';
import { JwkRsa } from '@rockcarver/frodo-lib/types/ops/JoseOps.js';
import { Option } from 'commander';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import { generateRfc7523AuthZGrantArtifacts } from '../../ops/AdminOps.js';
import { printMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand.js';

const { getTokens } = frodo.login;

const program = new FrodoCommand(
  'frodo admin generate-rfc7523-authz-grant-artifacts'
);

program
  .description('Generate RFC7523 authorization grant artifacts.')
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
  .addOption(
    new Option(
      '--no-save',
      'Do not save artifacts in AM and to file By default this command creates a fully configured oauth2 client and trusted issuer in AM and saves the generated JWK (private key) and JWKS (public key set) to files.'
    )
  )
  .addOption(new Option('--json', 'Output in JSON format.'))
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
          `Generating RFC7523 authorization grant artifacts in realm "${state.getRealm()}"...`
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
        const outcome = await generateRfc7523AuthZGrantArtifacts(
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

program.parse();
