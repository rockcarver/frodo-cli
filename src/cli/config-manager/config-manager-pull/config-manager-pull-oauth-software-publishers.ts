import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { configManagerExportSoftwarePublishers } from '../../../ops/SoftwarePublisherConfigOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { PLACEHOLDER_VALUES_SENTENCE } from '../../../utils/PlaceholderValues';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull oauth-software-publishers'
  );

  program
    .summary('Export software publishers, one file per publisher.')
    .description(
      'Export the OAuth2 software publishers (the publishers whose signed software statements an OAuth 2.0 provider accepts when a client registers itself dynamically) of all realms or of one realm to realms/<realm>/realm-config/agents/SoftwarePublisher/<name>.json, one file for each. The file is the one that "pull oauth2-agents" wrote for the same publisher, at the same path. A warning says when the key set of a publisher holds a private or secret key. A realm that does not offer the agent type has nothing to export. Software publishers are dynamic configuration: they are part of "pull all" and not of "pull all-static".'
    )
    .addOption(
      new Option(
        '-n, --name <name>',
        'Software publisher name, the name of the object. If specified, pulls only that publisher. Needs a single realm.'
      )
    )
    .addOption(
      new Option(
        '--config-file <file>',
        `A JSON file with overrides for values that differ between environments, e.g. "${s.softwarePublishersOverridesFile}".`
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Pull all software publishers of all realms to realms/<realm>/realm-config/agents/SoftwarePublisher/<name>.json:\n` +
        c.command(
          `  $ frodo config-manager pull oauth-software-publishers ${s.connId}\n`
        ) +
        `  Pull the software publishers of one realm:\n` +
        c.command(
          `  $ frodo config-manager pull oauth-software-publishers ${s.connId} ${s.realm}\n`
        ) +
        `  Pull one software publisher of a realm:\n` +
        c.command(
          `  $ frodo config-manager pull oauth-software-publishers -n ${s.softwarePublisherId} ${s.connId} ${s.realm}\n`
        ) +
        `  Replace values that differ between environments with placeholders from a file:\n` +
        c.command(
          `  $ frodo config-manager pull oauth-software-publishers --config-file ${s.softwarePublishersOverridesFile} ${s.connId}\n`
        )
    )
    .addHelpText(
      'after',
      `\nOverrides file example (${s.softwarePublishersOverridesFile}): for each realm a list of publishers and the values to replace, in the form of the file (a property that is set is its value; a value written as { "value": ... } of the first 5.0.0 prereleases still works). The properties that usually differ between environments are issuer, jwksUri and jwkSet.\n` +
        '{\n' +
        '  "alpha": [\n' +
        '    {\n' +
        `      "id": "${s.softwarePublisherId}",\n` +
        '      "overrides": {\n' +
        '        "issuer": "${ZION_PUBLISHER_ISSUER}",\n' +
        '        "jwksUri": "${ZION_PUBLISHER_JWKS_URI}"\n' +
        '      }\n' +
        '    }\n' +
        '  ]\n' +
        '}\n' +
        `When the files are pushed: ${PLACEHOLDER_VALUES_SENTENCE}\n`
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
            ? `Exporting software publisher "${options.name}".`
            : 'Exporting software publishers.'
        );
        const outcome = await configManagerExportSoftwarePublishers(
          options.name,
          realmOfRun(command, realm),
          false,
          options.allowFailures,
          options.configFile
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
