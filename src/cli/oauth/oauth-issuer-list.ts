import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { listOAuth2TrustedJwtIssuers } from '../../ops/OAuth2TrustedJwtIssuerOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo oauth issuer list');

  program
    .description('List OAuth2 trusted JWT issuers.')
    .addOption(
      new Option(
        '-l, --long',
        'Long with the issuer, the allowed subjects and the JWKS URI.'
      ).default(false, 'false')
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  List the id of every trusted JWT issuer of the realm and log in with AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo oauth issuer list ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  List them with the issuer value and the allowed subjects using a connection profile:\n` +
        c.command(`  $ frodo oauth issuer list --long ${s.connId}\n`)
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
          verboseMessage('Listing OAuth2 trusted JWT issuers...');
          const outcome = await listOAuth2TrustedJwtIssuers(options.long);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
