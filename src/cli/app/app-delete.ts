import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import {
  deleteApplication,
  deleteApplications,
} from '../../ops/ApplicationOps';
import { getTokens } from '../../ops/AuthenticateOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import {
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
import { FrodoCommand } from '../FrodoCommand';

/**
 * The application skeleton type isn't exported from frodo-lib's root;
 * derive it from the read function instead of importing an unexported
 * name.
 */
type ApplicationSkeleton = Awaited<
  ReturnType<typeof frodo.app.readApplications>
>[number];

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
        'Application id. If specified, -n and -a are ignored.'
      )
    )
    .addOption(
      new Option(
        '-n, --app-name <name>',
        'Application name. If specified, -a is ignored.'
      )
    )
    .addOption(
      new Option('-a, --all', 'Delete all applications. Ignored with -i or -n.')
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
        c.command(`  $ frodo app delete -a ${s.connId}\n`)
    )
    .requireOneOf({
      options: ['all', 'appId', 'appName'],
      purpose: 'what to delete',
    })
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
        // -i/--app-id or -n/--app-name
        if (
          (options.appId || options.appName) &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Deleting application...');
          const outcome = await deleteApplication(
            options.appId,
            options.appName,
            options.deep
          );
          if (!outcome) process.exitCode = 1;
        }
        // -a/--all, or an interactive pick (resolveEntityPicks is a no-op
        // outside the prompt gate, so a non-interactive run with neither
        // option never reaches deleteApplications here -- same as before
        // Phase 3, where the error branch below handled that case).
        else if (
          (options.all ||
            (await resolveEntityPicks(command, [
              entityPick<ApplicationSkeleton>({
                name: 'appId',
                kind: 'application',
                load: () => frodo.app.readApplications(),
                label: (application) =>
                  application.name || application._id || '',
                description: (application) => application.description,
              }),
            ]))) &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          if (options.appId || options.appName) {
            verboseMessage('Deleting application...');
            const outcome = await deleteApplication(
              options.appId,
              options.appName,
              options.deep
            );
            if (!outcome) process.exitCode = 1;
          } else {
            verboseMessage('Deleting all applications...');
            const outcome = await deleteApplications(options.deep);
            if (!outcome) process.exitCode = 1;
          }
        }
        // No branch ran: with requireOneOf satisfied, the only ways here
        // are getTokens() failing (keep the old exit-1 semantics) or the
        // user escaping the entity picker (declined to run).
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
