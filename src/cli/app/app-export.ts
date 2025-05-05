import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import * as s from '../../help/SampleData';
import {
  exportApplicationsToFile,
  exportApplicationsToFiles,
  exportApplicationToFile,
} from '../../ops/ApplicationOps';
import { getTokens } from '../../ops/AuthenticateOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo app export', [], deploymentTypes);

  program
    .description('Export applications.')
    .addOption(
      new Option(
        '-i, --app-id <app-id>',
        'Application name. If specified, -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
    .addOption(
      new Option(
        '-a, --all',
        'Export all applications to a single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all applications to separate files (*.application.json) in the current directory. Ignored with -i or -a.'
      )
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .addOption(
      new Option('--no-deps', 'Do not include any dependencies (scripts).')
    )
    .addHelpText(
      'after',
      `Important Note:\n`['brightYellow'] +
        `  The ${'frodo app'['brightCyan']} command to manage OAuth2 clients in v1.x has been renamed to ${'frodo oauth client'['brightCyan']} in v2.x\n` +
        `  The ${'frodo app'['brightCyan']} command in v2.x manages the new applications created using the new application templates in ForgeRock Identity Cloud. To manage oauth clients, use the ${'frodo oauth client'['brightCyan']} command.\n\n` +
        `Usage Examples:\n` +
        `  Export all applications to a single export file with an auto-generated filename using a connection profile:\n` +
        `  $ frodo app export -a ${s.connId}\n`['brightCyan'] +
        `  Export the first application to a single export file with a custom filename:\n` +
        `  $ frodo app export -f ./allMyApplications.application.json ${s.connId}\n`[
          'brightCyan'
        ] +
        `  Export all applications to separate export files with an auto-generated filenames:\n` +
        `  $ frodo app export -A ${s.connId}\n`['brightCyan'] +
        `  Export all applications without dependencies to a single export file:\n` +
        `  $ frodo app export --no-deps -a ${s.connId}\n`['brightCyan'] +
        `  Export the application 'myApp' to a file with an auto-generated filename of 'myApp.application.json':\n` +
        `  $ frodo app export -i myApp ${s.connId}\n`['brightCyan']
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
        // export
        if (options.appId && (await getTokens(false, true, deploymentTypes))) {
          verboseMessage('Exporting application...');
          const outcome = await exportApplicationToFile(
            options.appId,
            options.file,
            options.metadata,
            {
              useStringArrays: true,
              deps: options.deps,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // -a/--all
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all applications to file...');
          const outcome = await exportApplicationsToFile(
            options.file,
            options.metadata,
            {
              useStringArrays: true,
              deps: options.deps,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // -A/--all-separate
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all applications to separate files...');
          const outcome = await exportApplicationsToFiles(options.metadata, {
            useStringArrays: true,
            deps: options.deps,
          });
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
