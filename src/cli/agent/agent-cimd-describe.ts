import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { describeCIMDProfile } from '../../ops/CIMDProfileOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo agent cimd describe');

  program
    .description('Describe a CIMD profile.')
    .addOption(
      new Option(
        '-i, --agent-id <agent-id>',
        'Agent id: the id of the CIMD profile. Ids are not case-sensitive.'
      ).makeOptionMandatory()
    )
    .addOption(new Option('--json', 'Output the whole profile in JSON format.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Describe the CIMD profile '${s.cimdProfileId}' and log in with AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo agent cimd describe -i ${s.cimdProfileId} ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  Print the whole profile in JSON format using a connection profile:\n` +
        c.command(
          `  $ frodo agent cimd describe -i ${s.cimdProfileId} --json ${s.connId}\n`
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
          const outcome = await describeCIMDProfile(
            options.agentId,
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
