import { Command, Option } from 'commander';
import * as common from '../cmd_common.js';
import { AuthenticateOps, StartupOps, state } from '@rockcarver/frodo-lib';

const { getTokens } = AuthenticateOps;
const { applyUpdates, checkForUpdates } = StartupOps;

const program = new Command('frodo esv apply');

program
  .description(
    'Apply pending changes to secrets and variables. Applying pending changes requires a restart of the AM and IDM pods and can take up to 10 minutes to complete.'
  )
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(
    new Option(
      '--check-only',
      "Check if updated need to be apply but don't apply them."
    ).default(false, 'false')
  )
  .addOption(
    new Option('--force', 'Force restart of services if no updates are found.')
  )
  .addOption(
    new Option('--no-wait', "Don't wait for the updates to finish applying.")
  )
  .addOption(
    new Option(
      '--verbose',
      'Verbose output during command execution. If specified, may or may not produce additional output.'
    ).default(false, 'off')
  )
  .addOption(new Option('-y, --yes', 'Answer y/yes to all prompts.'))
  .action(
    // implement command logic inside action handler
    async (host, realm, user, password, options) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      if (await getTokens()) {
        // check for updates only
        if (options.checkOnly) {
          console.log(`Checking for updates...`);
          await checkForUpdates();
        }
        // apply updates
        else {
          console.log(`Applying updates...`);
          await applyUpdates(options.force, options.wait, options.yes);
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
