import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { listCIMDProfiles } from '../../ops/CIMDProfileOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo oauth cimd list');

  program
    .description('List CIMD profiles.')
    .addOption(
      new Option('-l, --long', 'Long with all fields.').default(false, 'false')
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  List the id of every CIMD profile of the realm and log in with AM base URL, realm, username and password:\n` +
        c.command(
          `  $ frodo oauth cimd list ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        ) +
        `  List them with their status and URL patterns using a connection profile:\n` +
        c.command(`  $ frodo oauth cimd list --long ${s.connId}\n`)
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
          const outcome = await listCIMDProfiles(options.long);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
