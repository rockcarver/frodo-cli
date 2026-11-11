import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { configManagerExportTrustedJwtIssuers } from '../../../ops/OAuth2TrustedJwtIssuerConfigOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull oauth-issuers');

  program
    .summary('Export trusted JWT issuers, one file per issuer.')
    .description(
      'Export the OAuth2 trusted JWT issuers (the issuers whose signed JWTs an OAuth 2.0 provider accepts as grants) of all realms or of one realm to realms/<realm>/realm-config/agents/TrustedJwtIssuer/<name>.json, one file for each. The file is the one that "pull oauth2-agents" writes for the same issuer, at the same path. A warning says when the key set of an issuer holds a private or secret key. Trusted JWT issuers are dynamic configuration: they are part of "pull all" and not of "pull all-static".'
    )
    .addOption(
      new Option(
        '-n, --name <name>',
        'Trusted JWT issuer name, the name of the object and not its iss URL. If specified, pulls only that issuer. Needs a single realm.'
      )
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        `A JSON file with overrides for values that differ between environments, e.g. "${s.trustedJwtIssuersOverridesFile}".`
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Pull all trusted JWT issuers of all realms to realms/<realm>/realm-config/agents/TrustedJwtIssuer/<name>.json:\n` +
        c.command(`  $ frodo config-manager pull oauth-issuers ${s.connId}\n`) +
        `  Pull the trusted JWT issuers of one realm:\n` +
        c.command(
          `  $ frodo config-manager pull oauth-issuers ${s.connId} ${s.realm}\n`
        ) +
        `  Pull one trusted JWT issuer of a realm:\n` +
        c.command(
          `  $ frodo config-manager pull oauth-issuers -n ${s.trustedJwtIssuerId} ${s.connId} ${s.realm}\n`
        ) +
        `  Replace values that differ between environments with placeholders from a file:\n` +
        c.command(
          `  $ frodo config-manager pull oauth-issuers -f ${s.trustedJwtIssuersOverridesFile} ${s.connId}\n`
        )
    )
    .addHelpText(
      'after',
      `\nOverrides file example (${s.trustedJwtIssuersOverridesFile}): for each realm a list of issuers and the values to replace, in the form of the file (every property is wrapped as inherited and value). The properties that usually differ between environments are issuer, jwksUri, jwkSet and allowedSubjects.\n` +
        '{\n' +
        '  "alpha": [\n' +
        '    {\n' +
        `      "id": "${s.trustedJwtIssuerId}",\n` +
        '      "overrides": {\n' +
        '        "issuer": { "value": "${ZION_ISSUER_URL}" },\n' +
        '        "jwksUri": { "value": "${ZION_JWKS_URI}" }\n' +
        '      }\n' +
        '    }\n' +
        '  ]\n' +
        '}\n' +
        'Push fills each ${NAME} from the environment variable NAME.\n'
    )
    .multiOp()
    .usesRealm()
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      if (await getTokens()) {
        verboseMessage(
          options.name
            ? `Exporting trusted JWT issuer "${options.name}".`
            : 'Exporting trusted JWT issuers.'
        );
        const outcome = await configManagerExportTrustedJwtIssuers(
          options.name,
          realmOfRun(command, realm),
          false,
          options.allowFailures,
          options.file
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
