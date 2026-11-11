import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { configManagerExportCIMDProfiles } from '../../../ops/CIMDProfileConfigOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull oauth-cimd-profiles'
  );

  program
    .summary('Export CIMD profiles, one file per profile.')
    .description(
      'Export the CIMD profiles (the allow-list of client ID URL patterns for OAuth 2.0 clients that identify themselves with a Client ID Metadata Document) of all realms or of one realm to realms/<realm>/realm-config/agents/CIMDProfile/<name>.json, one file for each. The object is written as the server lists it, without its revision; it contains no secrets. A realm or a deployment that does not offer CIMD profiles has nothing to export, which is not an error.'
    )
    .addOption(
      new Option(
        '-n, --name <name>',
        'CIMD profile name. If specified, pulls only the profile with the given name. Needs a single realm.'
      )
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        `A JSON file with overrides for values that differ between environments, e.g. "${s.cimdOverridesFile}".`
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Pull all CIMD profiles of all realms to realms/<realm>/realm-config/agents/CIMDProfile/<name>.json:\n` +
        c.command(
          `  $ frodo config-manager pull oauth-cimd-profiles ${s.connId}\n`
        ) +
        `  Pull the CIMD profiles of one realm:\n` +
        c.command(
          `  $ frodo config-manager pull oauth-cimd-profiles ${s.connId} ${s.realm}\n`
        ) +
        `  Pull one CIMD profile of a realm:\n` +
        c.command(
          `  $ frodo config-manager pull oauth-cimd-profiles -n ${s.cimdProfileId} ${s.connId} ${s.realm}\n`
        ) +
        `  Replace values that differ between environments with placeholders from a file:\n` +
        c.command(
          `  $ frodo config-manager pull oauth-cimd-profiles -f ${s.cimdOverridesFile} ${s.connId}\n`
        )
    )
    .addHelpText(
      'after',
      `\nOverrides file example (${s.cimdOverridesFile}): for each realm a list of profiles and the values to replace. An array is replaced element by element, so list every element that should change.\n` +
        '{\n' +
        '  "alpha": [\n' +
        '    {\n' +
        `      "id": "${s.cimdProfileId}",\n` +
        '      "overrides": {\n' +
        '        "cimdConfig": {\n' +
        '          "cimdClientIdUrlPatterns": ["${ZION_AGENTS_URL_PATTERN}"]\n' +
        '        }\n' +
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
            ? `Exporting CIMD profile "${options.name}".`
            : 'Exporting CIMD profiles.'
        );
        const outcome = await configManagerExportCIMDProfiles(
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
