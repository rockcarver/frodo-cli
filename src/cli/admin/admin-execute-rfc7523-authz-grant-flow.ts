import fs from 'fs';
import { type JwkRsa } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { executeRfc7523AuthZGrantFlow } from '../../ops/AdminOps.js';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  createSubjectSource,
  SUBJECT_LIST_LIMIT,
  subjectMatches,
  type SubjectCandidate,
} from '../../ops/Rfc7523SubjectOps';
import c from '../../utils/ColorTheme';
import { printMessage } from '../../utils/Console.js';
import {
  deferEntityPicks,
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
import { FrodoCommand } from '../FrodoCommand.js';

export default function setup() {
  const program = new FrodoCommand(
    'frodo admin execute-rfc7523-authz-grant-flow'
  );

  program
    .description('Execute RFC7523 authorization grant flow.')
    // There is no client to run the flow for without its id (cli#1001).
    .addOption(
      new Option('--client-id <id>', 'Client id.').makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--jwk-file <file>',
        'Path to JSON Web Key (JWK) file containing private key. Defaults to <client id>_private.jwk.json in the current directory, where generate-rfc7523-authz-grant-artefacts saves it.'
      )
    )
    .addOption(
      new Option(
        '--sub <subject>',
        "ID of the user to get tokens for, typically a UUID. If omitted, the trusted issuer's only allowed subject is used. Name one when the issuer allows several users or any user."
      )
    )
    .addOption(
      new Option(
        '--iss <issuer>',
        'Trusted issuer, typically a URL. Defaults to the issuer of the trusted issuer named <client id>-issuer.'
      )
    )
    .addOption(
      new Option('--scope <scope>', 'Space-delimited list of scopes.').default(
        'openid fr:am:* fr:idm:*'
      )
    )
    .addOption(new Option('--json', 'Output in JSON format.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  If you used frodo to create the RFC7523 configuration (see 'Related Commands' below), then you can test your configuration with minimal input: frodo locates the trusted issuer and the private key, and you name the user to get tokens for (on a terminal, leave --sub out to pick the user from a list). The command below returns access token and identity token:\n` +
        c.command(
          `  $ frodo admin execute-rfc7523-authz-grant-flow --client-id rfc7523-client1 --sub 146c2230-9448-4442-b86d-eb4a81a0121d ${s.amBaseUrl}\n`
        ) +
        `  Same as above but output raw json:\n` +
        c.command(
          `  $ frodo admin execute-rfc7523-authz-grant-flow --client-id rfc7523-client1 --sub 146c2230-9448-4442-b86d-eb4a81a0121d --json ${s.amBaseUrl}\n`
        ) +
        `  Same as first command above but explicitly provide all parameters, which also works when the trusted issuer was not created by frodo:\n` +
        c.command(
          `  $ frodo admin execute-rfc7523-authz-grant-flow --client-id rfc7523-client1 --iss https://my-issuer.com/issuer --sub 146c2230-9448-4442-b86d-eb4a81a0121d --jwk-file rfc7523-client1_private.jwk.json ${s.amBaseUrl}\n`
        ) +
        `\nRelated Commands:\n` +
        `  Run ${c.command('frodo admin generate-rfc7523-authz-grant-artefacts --help')} to see how to create the required configuration artefacts for ${c.command('frodo admin execute-rfc7523-authz-grant-flow')}:\n`
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
        // An unspecified --sub is picked from the users the trusted issuer
        // allows, or the realm's (no-op outside the prompt gate).
        if ((await getTokens()) && (await resolveEntityPicks(command))) {
          printMessage(`Executing RFC7523 authorization grant flow...`);
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
              process.exitCode = 1;
              return;
            }
          }
          const outcome = await executeRfc7523AuthZGrantFlow(
            options.clientId,
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

  const subjects = createSubjectSource(() => program.opts().clientId);
  deferEntityPicks(program, [
    entityPick<SubjectCandidate>({
      name: 'sub',
      kind: 'user',
      message: 'Select the user to get tokens for:',
      load: () => subjects.list(),
      label: (user) => user.row,
      value: (user) => user.id,
      description: (user) => user.mail,
      search: subjectMatches,
      searchFirst: {
        when: () => subjects.tooMany(),
        message: 'Search users:',
        hint: `The realm has ${SUBJECT_LIST_LIMIT} or more users. Type part of a username, first or last name or email, or a whole id.`,
        load: (text) => subjects.search(text),
      },
    }),
  ]);

  return program;
}
