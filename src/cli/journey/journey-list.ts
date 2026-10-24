import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { listJourneys } from '../../ops/JourneyOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo journey list');

  program
    .description('List journeys/trees.')
    .addOption(
      new Option('-l, --long', 'Long with all fields.').default(false, 'false')
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  List journeys using a connection profile:\n` +
        c.command(`  $ frodo journey list ${s.connId}\n`) +
        `  List journeys with all fields and log in with AM base URL, username, and password:\n` +
        c.command(
          `  $ frodo journey list --long ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
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
        if (await getTokens()) {
          verboseMessage(`Listing journeys in realm "${state.getRealm()}"...`);
          const outcome = await listJourneys(options.long);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
