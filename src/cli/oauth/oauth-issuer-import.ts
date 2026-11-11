import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  importFirstOAuth2TrustedJwtIssuerFromFile,
  importOAuth2TrustedJwtIssuerFromFile,
  importOAuth2TrustedJwtIssuersFromFile,
  importOAuth2TrustedJwtIssuersFromFiles,
} from '../../ops/OAuth2TrustedJwtIssuerOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo oauth issuer import');

  program
    .description('Import OAuth2 trusted JWT issuers.')
    .addOption(
      new Option(
        '-i, --issuer-id <issuer-id>',
        'Trusted issuer id: import this one from the file given with -f. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the import file. Without -i or -a the first issuer of the file is imported. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all trusted issuers from the file given with -f. Cannot be used with -i or -A.'
      ).conflicts(['issuerId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all trusted issuers from separate files (*.oauth2.issuer.json, and *.trustedJwtIssuer.json as a full export writes them) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['issuerId', 'file', 'all'])
    )
    .requireOneOf({
      options: ['file', 'allSeparate'],
      purpose: 'what to import',
    })
    .multiOp()
    .addHelpText(
      'after',
      `Importing a trusted issuer changes whose assertions the realm accepts. Check the issuer value and the allowed subjects of the file first: an issuer without allowed subjects can name any realm user. Attributes that the server refuses are dropped by the library.\n` +
        `The files of ${c.command('frodo agent export')} and ${c.command('frodo config export')} that hold trusted issuers import as well.\n\n` +
        `Usage Examples:\n` +
        `  Import the trusted issuer '${s.trustedIssuerId}' from a file and log in with AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo oauth issuer import -i ${s.trustedIssuerId} -f ${s.trustedIssuerFile} ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Import the first trusted issuer of a file using a connection profile:\n` +
        c.command(
          `  $ frodo oauth issuer import -f ${s.trustedIssuerFile} ${s.connId}\n`
        ) +
        `  Import all trusted issuers from a single file:\n` +
        c.command(
          `  $ frodo oauth issuer import -a -f ${s.allTrustedIssuersFile} ${s.connId}\n`
        ) +
        `  Import all trusted issuers from separate files in the current directory:\n` +
        c.command(`  $ frodo oauth issuer import -A ${s.connId}\n`)
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
          let outcome: boolean;
          if (options.allSeparate) {
            verboseMessage(
              'Importing all trusted issuers from separate files in the current directory...'
            );
            outcome = await importOAuth2TrustedJwtIssuersFromFiles(
              options.allowFailures
            );
          } else if (options.issuerId) {
            verboseMessage(`Importing trusted issuer ${options.issuerId}...`);
            outcome = await importOAuth2TrustedJwtIssuerFromFile(
              options.issuerId,
              options.file
            );
          } else if (options.all) {
            verboseMessage(
              `Importing all trusted issuers from a single file (${options.file})...`
            );
            outcome = await importOAuth2TrustedJwtIssuersFromFile(
              options.file,
              options.allowFailures
            );
          } else {
            verboseMessage(
              `Importing the first trusted issuer from file "${options.file}"...`
            );
            outcome = await importFirstOAuth2TrustedJwtIssuerFromFile(
              options.file
            );
          }
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
