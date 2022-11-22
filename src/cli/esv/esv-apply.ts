import { Command, Option } from 'commander';
import {
  Authenticate,
  Startup,
  ManagedObject,
  state,
} from '@rockcarver/frodo-lib';
import yesno from 'yesno';
import * as common from '../cmd_common.js';
import { createTable, printMessage } from '../../utils/Console.js';

const { getTokens } = Authenticate;
const { applyUpdates, checkForUpdates } = Startup;
const { resolveUserName } = ManagedObject;

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
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(common.curlirizeOption)
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
      '--timeout <seconds>',
      'Specify a timeout in seconds how long the tool should wait for the apply command to finish. Only effective without --no-wait.'
    ).default(600, '600 secs (10 mins)')
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
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      if (await getTokens()) {
        const updates = await checkForUpdates();
        const updatesTable = createTable([
          'Type',
          'Name',
          'Modified',
          'Modifier',
        ]);
        for (const secret of updates.secrets) {
          if (!secret['loaded']) {
            updatesTable.push([
              'secret',
              secret['_id'],
              new Date(secret['lastChangeDate']).toLocaleString(),
              // eslint-disable-next-line no-await-in-loop
              await resolveUserName('teammember', secret['lastChangedBy']),
            ]);
          }
        }
        for (const variable of updates.variables) {
          if (!variable['loaded']) {
            updatesTable.push([
              'variable',
              variable['_id'],
              new Date(variable['lastChangeDate']).toLocaleString(),
              // eslint-disable-next-line no-await-in-loop
              await resolveUserName('teammember', variable['lastChangedBy']),
            ]);
          }
        }
        if (updatesTable.length > 0) {
          printMessage(updatesTable.toString(), 'data');
        }
        if (!options.checkOnly) {
          if (
            updates.secrets?.length ||
            updates.variables?.length ||
            options.force
          ) {
            const ok =
              options.yes ||
              (await yesno({
                question: `\nChanges may take up to 10 minutes to propagate, during which time you will not be able to make further updates.\n\nApply updates? (y|n):`,
              }));
            if (ok) {
              if (!(await applyUpdates(options.wait, options.timeout * 1000))) {
                process.exitCode = 1;
              }
            }
          }
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
