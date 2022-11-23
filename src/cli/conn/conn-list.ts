import { Command, Option } from 'commander';
import { ConnectionProfile, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';

const { listConnectionProfiles } = ConnectionProfile;

const program = new Command('frodo conn list');

program
  .description('List connection profiles.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(
    new Option('-l, --long', 'Long with all fields.').default(false, 'false')
  )
  .action(
    // implement command logic inside action handler
    async (options) => {
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      listConnectionProfiles(options.long);
    }
    // end command logic inside action handler
  );

program.parse();
