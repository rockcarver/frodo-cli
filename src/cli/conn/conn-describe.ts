import { Command, Option } from 'commander';
import { ConnectionProfile, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';

const { describeConnectionProfile } = ConnectionProfile;

const program = new Command('frodo conn describe');

program
  .description('Describe connection profile.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(new Option('--show-secrets', 'Show passwords and secrets.'))
  .action(
    // implement command logic inside action handler
    async (host, options) => {
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      describeConnectionProfile(host, options.showSecrets);
    }
    // end command logic inside action handler
  );

program.parse();
