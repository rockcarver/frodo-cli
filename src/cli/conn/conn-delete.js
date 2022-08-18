import { Command } from 'commander';
import * as common from '../cmd_common.js';
import { ConnectionProfileOps, state } from '@rockcarver/frodo-lib';

const { deleteConnectionProfile } = ConnectionProfileOps;

const program = new Command('frodo conn delete');

program
  .description('Delete connection profiles.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .action(
    // implement command logic inside action handler
    async (host) => {
      deleteConnectionProfile(host);
    }
    // end command logic inside action handler
  );

program.parse();
