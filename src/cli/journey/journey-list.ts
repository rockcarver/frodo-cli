import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { listJourneys } from '../../ops/JourneyOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo journey list');

program
  .description('List journeys/trees.')
  .addOption(
    new Option('-l, --long', 'Long with all fields.').default(false, 'false')
  )
  .addOption(new Option('-a, --analyze', 'Analyze journeys for custom nodes.'))
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
        await listJourneys(options.long, options.analyze);
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
