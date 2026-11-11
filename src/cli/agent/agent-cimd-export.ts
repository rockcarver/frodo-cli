import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportCIMDProfilesToFile,
  exportCIMDProfilesToFiles,
  exportCIMDProfileToFile,
} from '../../ops/CIMDProfileOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo agent cimd export');

  program
    .description('Export CIMD profiles.')
    .addOption(
      new Option(
        '-i, --agent-id <agent-id>',
        'Agent id: the id of the CIMD profile. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the export file. Defaults to <id>.cimd.agent.json for a profile and allAlphaAgents.cimd.agent.json (the realm in its name) for -a. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all CIMD profiles to a single file. Cannot be used with -i or -A.'
      ).conflicts(['agentId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all CIMD profiles to separate files (*.cimd.agent.json) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['agentId', 'file', 'all'])
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'agentId'],
      purpose: 'what to export',
    })
    .addHelpText(
      'after',
      `A CIMD profile holds no secrets. The scripts, journeys and policy sets it refers to are not exported with it and must exist in the realm you import it into.\n\n` +
        `Usage Examples:\n` +
        `  Export the CIMD profile '${s.cimdProfileId}' to ${s.cimdProfileFile} and log in with AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo agent cimd export -i ${s.cimdProfileId} ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Export it to a file of your choice using a connection profile:\n` +
        c.command(
          `  $ frodo agent cimd export -i ${s.cimdProfileId} -f my-cimd-profile.json ${s.connId}\n`
        ) +
        `  Export all CIMD profiles to a single file:\n` +
        c.command(`  $ frodo agent cimd export -a ${s.connId}\n`) +
        `  Export all CIMD profiles to separate files:\n` +
        c.command(`  $ frodo agent cimd export -A ${s.connId}\n`) +
        `  Export all CIMD profiles without metadata:\n` +
        c.command(`  $ frodo agent cimd export -a -N ${s.connId}\n`)
    )
    .multiOp()
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
          if (options.all) {
            verboseMessage('Exporting all CIMD profiles to a single file...');
            outcome = await exportCIMDProfilesToFile(
              options.file,
              options.metadata
            );
          } else if (options.allSeparate) {
            verboseMessage('Exporting all CIMD profiles to separate files...');
            outcome = await exportCIMDProfilesToFiles(
              options.metadata,
              options.allowFailures
            );
          } else {
            // -i; it is unset when the picker had nothing to offer, which the
            // ops function reports (and then fails)
            verboseMessage(`Exporting CIMD profile ${options.agentId}...`);
            outcome = await exportCIMDProfileToFile(
              options.agentId,
              options.file,
              options.metadata
            );
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
