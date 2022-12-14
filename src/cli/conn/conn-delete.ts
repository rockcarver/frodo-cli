import { Command } from 'commander';
import { ConnectionProfile, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';

const { deleteConnectionProfile } = ConnectionProfile;

const program = new Command('frodo conn delete');

program
  .description('Delete connection profiles.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgument)
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .action(
    // implement command logic inside action handler
    async (host, options) => {
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      deleteConnectionProfile(host);
    }
    // end command logic inside action handler
  );

program.parse();
