import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import c from 'tinyrainbow';

import * as s from '../../help/SampleData';
import {
  deleteApplication,
  deleteApplications,
} from '../../ops/ApplicationOps';
import { getTokens } from '../../ops/AuthenticateOps';
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
      c.yellowBright(`Important Note:\n`) +
        `  The ${c.cyanBright('frodo app')} command to manage OAuth2 clients in v1.x has been renamed to ${c.cyanBright('frodo oauth client')} in v2.x\n` +
        `  The ${c.cyanBright('frodo app')} command in v2.x manages the new applications created using the new application templates in ForgeRock Identity Cloud. To manage oauth clients, use the ${c.cyanBright('frodo oauth client')} command.\n\n` +
        `Usage Examples:\n` +
        `  Delete application 'myApp':\n` +
        c.cyanBright(`  $ frodo app delete -i 'myApp' ${s.amBaseUrl}\n`) +
        `  Delete all applications:\n` +
        c.cyanBright(`  $ frodo app delete -a ${s.connId}\n`)
    )
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
        // -a/--all
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Deleting all applications...');
          const outcome = await deleteApplications(options.deep);
          if (!outcome) process.exitCode = 1;
        }
        // unrecognized combination of options or no options
        else {
          verboseMessage(
            'Unrecognized combination of options or no options...'
          );
          program.help();
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
