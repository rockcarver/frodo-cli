import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { describeOAuth2TrustedJwtIssuer } from '../../ops/OAuth2TrustedJwtIssuerOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo oauth issuer describe');

  program
    .description('Describe an OAuth2 trusted JWT issuer.')
    .addOption(
      new Option(
        '-i, --issuer-id <issuer-id>',
        'Trusted issuer id: the name of the object in the realm, not the issuer URL (iss) that its assertions carry.'
      ).makeOptionMandatory()
    )
    .addOption(
      new Option(
        '--json',
        'Output the whole issuer in JSON format, including the key set.'
      )
    )
    .addHelpText(
      'after',
      `The table shows the key set as set or not set, because it is a long JSON text. An issuer without allowed subjects may name any user of the realm in its assertions.\n\n` +
        `Usage Examples:\n` +
        `  Describe the trusted issuer '${s.trustedIssuerId}' and log in with AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo oauth issuer describe -i ${s.trustedIssuerId} ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Print the whole issuer in JSON format using a connection profile:\n` +
        c.command(
          `  $ frodo oauth issuer describe -i ${s.trustedIssuerId} --json ${s.connId}\n`
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
        // an unspecified -i gets a picker from the framework after the login
        // (decision record 0038), so the login comes first
        if (await getTokens()) {
          const outcome = await describeOAuth2TrustedJwtIssuer(
            options.issuerId,
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
