import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import {
  deleteApplication,
  deleteApplications,
} from '../../ops/ApplicationOps';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo app delete', [], deploymentTypes);

  program
    .description('Delete applications.')
    .addOption(
      new Option(
        '-i, --app-id <id>',
        'Application id. Cannot be used with -n or -a.'
      ).conflicts(['appName', 'all'])
    )
    .addOption(
      new Option(
        '-n, --app-name <name>',
        'Application name. Cannot be used with -i or -a.'
      ).conflicts(['appId', 'all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all applications. Cannot be used with -i or -n.'
      ).conflicts(['appId', 'appName'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all applications. Required with -a when there is no terminal.'
      )
    )
    .addOption(
      new Option(
        '--no-deep',
        'No deep delete. This leaves orphaned configuration artifacts behind.'
      )
    )
    .addHelpText(
      'after',
      c.warning(`Important Note:\n`) +
        `  The ${c.command('frodo app')} command to manage OAuth2 clients in v1.x has been renamed to ${c.command('frodo oauth client')} in v2.x\n` +
        `  The ${c.command('frodo app')} command in v2.x manages the new applications created using the new application templates in ForgeRock Identity Cloud. To manage oauth clients, use the ${c.command('frodo oauth client')} command.\n\n` +
        `Usage Examples:\n` +
        `  Delete application 'myApp':\n` +
        c.command(`  $ frodo app delete -i 'myApp' ${s.amBaseUrl}\n`) +
        `  Delete all applications:\n` +
        c.command(`  $ frodo app delete -a -y ${s.connId}\n`)
    )
    .requireOneOf({
      options: ['all', 'appId', 'appName'],
      purpose: 'what to delete',
    })
    .multiOp()
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
        // a run that nobody can be asked about is refused before the login
        // (cli record 0037)
        if (
          options.all &&
          !checkBulkDelete({
            what: 'all applications',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        // an unspecified -i/-n gets a picker from the framework after the
        // login (decision record 0038), so the login comes first
        if (await getTokens(false, true, deploymentTypes)) {
          if (options.appId || options.appName) {
            verboseMessage('Deleting application...');
            const outcome = await deleteApplication(
              options.appId,
              options.appName,
              options.deep
            );
            if (!outcome) process.exitCode = 1;
          } else {
            if (
              !(await confirmBulkDelete({
                what: 'all applications',
                yes: options.yes,
                dryRunAvailable: false,
              }))
            ) {
              process.exitCode = 1;
              return;
            }
            verboseMessage('Deleting all applications...');
            const outcome = await deleteApplications(
              options.deep,
              options.allowFailures
            );
            if (!outcome) process.exitCode = 1;
          }
        } else {
          // getTokens() failed, or the user declined the pick
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
