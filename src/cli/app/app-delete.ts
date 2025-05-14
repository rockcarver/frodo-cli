import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

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
        'Application name. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option('-a, --all', 'Delete all applications. Ignored with -i.')
    )
    .addOption(
      new Option(
        '--no-deep',
        'No deep delete. This leaves orphaned configuration artifacts behind.'
      )
    )
    .addHelpText(
      'after',
      `Important Note:\n`['brightYellow'] +
        `  The ${'frodo app'['brightCyan']} command to manage OAuth2 clients in v1.x has been renamed to ${'frodo oauth client'['brightCyan']} in v2.x\n` +
        `  The ${'frodo app'['brightCyan']} command in v2.x manages the new applications created using the new application templates in ForgeRock Identity Cloud. To manage oauth clients, use the ${'frodo oauth client'['brightCyan']} command.\n\n` +
        `Usage Examples:\n` +
        `  Delete application 'myApp':\n` +
        `  $ frodo app delete -i 'myApp' ${s.amBaseUrl}\n`['brightCyan'] +
        `  Delete all applications:\n` +
        `  $ frodo app delete -a ${s.connId}\n`['brightCyan']
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
        // delete app by name
        if (options.appId && (await getTokens(false, true, deploymentTypes))) {
          verboseMessage('Deleting application...');
          const outcome = await deleteApplication(options.appId, options.deep);
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
