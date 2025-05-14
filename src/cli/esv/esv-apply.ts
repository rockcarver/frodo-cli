import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import yesno from 'yesno';

import { getTokens } from '../../ops/AuthenticateOps';
import { createTable, printMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { checkForUpdates, applyUpdates } = frodo.cloud.startup;
const { resolveUserName } = frodo.idm.managed;

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv apply',
    ['realm'],
    deploymentTypes
  );

  program
    .description(
      'Apply pending changes to secrets and variables. Applying pending changes requires a restart of the AM and IDM pods and can take up to 10 minutes to complete.'
    )
    .addOption(
      new Option(
        '--check-only',
        "Check if updated need to be apply but don't apply them."
      ).default(false, 'false')
    )
    .addOption(
      new Option(
        '--force',
        'Force restart of services if no updates are found.'
      )
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
      async (host, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          user,
          password,
          options,
          command
        );
        if (await getTokens(false, true, deploymentTypes)) {
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
                if (
                  !(await applyUpdates(options.wait, options.timeout * 1000))
                ) {
                  process.exitCode = 1;
                }
              }
            }
          }
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
