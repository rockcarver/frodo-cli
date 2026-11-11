import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  importCIMDProfileFromFile,
  importCIMDProfilesFromFile,
  importCIMDProfilesFromFiles,
  importFirstCIMDProfileFromFile,
} from '../../ops/CIMDProfileOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo oauth cimd import');

  program
    .description('Import CIMD profiles.')
    .addOption(
      new Option(
        '-i, --agent-id <agent-id>',
        'Agent id: import this CIMD profile from the file given with -f. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the import file. Without -i or -a the first profile of the file is imported. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all CIMD profiles from the file given with -f. Cannot be used with -i or -A.'
      ).conflicts(['agentId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all CIMD profiles from separate files (*.cimd.agent.json) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['agentId', 'file', 'all'])
    )
    .requireOneOf({
      options: ['file', 'allSeparate'],
      purpose: 'what to import',
    })
    .multiOp()
    .addHelpText(
      'after',
      `Importing a profile changes which client_id URLs the authorization server accepts as OAuth 2.0 clients of the realm. Check the URL patterns and the SSRF protection setting of the file first. The scripts and journeys a profile refers to must exist in the realm. On a deployment that does not offer CIMD profiles, -a and -A say so and import nothing without failing; -i and the first profile of -f fail.\n\n` +
        `Usage Examples:\n` +
        `  Import the CIMD profile '${s.cimdProfileId}' from a file and log in with AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo oauth cimd import -i ${s.cimdProfileId} -f ${s.cimdProfileFile} ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Import the first profile of a file using a connection profile:\n` +
        c.command(
          `  $ frodo oauth cimd import -f ${s.cimdProfileFile} ${s.connId}\n`
        ) +
        `  Import all profiles from a single file:\n` +
        c.command(
          `  $ frodo oauth cimd import -a -f ${s.allCimdProfilesFile} ${s.connId}\n`
        ) +
        `  Import all profiles from separate files in the current directory:\n` +
        c.command(`  $ frodo oauth cimd import -A ${s.connId}\n`)
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
              'Importing all CIMD profiles from separate files (*.cimd.agent.json) in the current directory...'
            );
            outcome = await importCIMDProfilesFromFiles(options.allowFailures);
          } else if (options.agentId) {
            verboseMessage(`Importing CIMD profile ${options.agentId}...`);
            outcome = await importCIMDProfileFromFile(
              options.agentId,
              options.file
            );
          } else if (options.all) {
            verboseMessage(
              `Importing all CIMD profiles from a single file (${options.file})...`
            );
            outcome = await importCIMDProfilesFromFile(
              options.file,
              options.allowFailures
            );
          } else {
            verboseMessage(
              `Importing the first CIMD profile from file "${options.file}"...`
            );
            outcome = await importFirstCIMDProfileFromFile(options.file);
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
