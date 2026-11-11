import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportOAuth2TrustedJwtIssuersToFile,
  exportOAuth2TrustedJwtIssuersToFiles,
  exportOAuth2TrustedJwtIssuerToFile,
} from '../../ops/OAuth2TrustedJwtIssuerOps';
import c from '../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo oauth issuer export');

  program
    .description('Export OAuth2 trusted JWT issuers.')
    .addOption(
      new Option(
        '-i, --issuer-id <issuer-id>',
        'Trusted issuer id: the name of the object in the realm, not the issuer URL (iss) that its assertions carry. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the export file. Defaults to <id>.oauth2.issuer.json for an issuer and allAlphaIssuers.oauth2.issuer.json for -a (the realm in its name). Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all trusted issuers to a single file. Cannot be used with -i or -A.'
      ).conflicts(['issuerId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all trusted issuers to separate files (*.oauth2.issuer.json) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['issuerId', 'file', 'all'])
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .requireOneOf({
      options: ['issuerId', 'all', 'allSeparate'],
      purpose: 'what to export',
    })
    .multiOp()
    .addHelpText(
      'after',
      `The file holds the public settings of the issuer (issuer value, allowed subjects, key set or key set URL). It holds no secret.\n\n` +
        `Usage Examples:\n` +
        `  Export the trusted issuer '${s.trustedIssuerId}' to ${s.trustedIssuerFile} and log in with AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo oauth issuer export -i ${s.trustedIssuerId} ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Export it to a file of your choice using a connection profile:\n` +
        c.command(
          `  $ frodo oauth issuer export -i ${s.trustedIssuerId} -f my-issuer.json ${s.connId}\n`
        ) +
        `  Export all trusted issuers to a single file:\n` +
        c.command(`  $ frodo oauth issuer export -a ${s.connId}\n`) +
        `  Export all trusted issuers to separate files:\n` +
        c.command(`  $ frodo oauth issuer export -A ${s.connId}\n`) +
        `  Export all trusted issuers without metadata:\n` +
        c.command(`  $ frodo oauth issuer export -a -N ${s.connId}\n`)
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
          let outcome: boolean;
          if (options.issuerId) {
            verboseMessage(`Exporting trusted issuer ${options.issuerId}...`);
            outcome = await exportOAuth2TrustedJwtIssuerToFile(
              options.issuerId,
              options.file,
              options.metadata
            );
          } else if (options.all) {
            verboseMessage('Exporting all trusted issuers to a single file...');
            outcome = await exportOAuth2TrustedJwtIssuersToFile(
              options.file,
              options.metadata
            );
          } else if (options.allSeparate) {
            verboseMessage(
              'Exporting all trusted issuers to separate files...'
            );
            outcome = await exportOAuth2TrustedJwtIssuersToFiles(
              options.metadata,
              options.allowFailures
            );
          } else {
            // the picker had nothing to offer: never fall through to an export of everything
            printMessage(
              'There is no trusted JWT issuer to choose from.',
              'warn'
            );
            outcome = false;
          }
          if (!outcome) process.exitCode = 1;
        } else {
          // getTokens() failed, or the user declined the pick
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
