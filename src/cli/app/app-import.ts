import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import c from 'tinyrainbow';

import * as s from '../../help/SampleData';
import {
  importApplicationFromFile,
  importApplicationsFromFile,
  importApplicationsFromFiles,
  importFirstApplicationFromFile,
} from '../../ops/ApplicationOps';
import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo app import', [], deploymentTypes);

  program
    .description('Import applications.')
    .addOption(
      new Option(
        '-i, --app-id <id>',
        'Application id. If specified, only one application is imported and the options -n, -a, and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-n, --app-name <name>',
        'Application name. If specified, only one application is imported and the options -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
    .addOption(
      new Option(
        '-a, --all',
        'Import all applications from single file. Ignored with -i or -n.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all applications from separate files (*.app.json) in the current directory. Ignored with -i, -n, or -a.'
      )
    )
    .addOption(
      new Option('--no-deps', 'Do not include any dependencies (scripts).')
    )
    .addHelpText(
      'after',
      c.yellowBright(`Important Note:\n`) +
        `  The ${c.cyanBright('frodo app')} command to manage OAuth2 clients in v1.x has been renamed to ${c.cyanBright('frodo oauth client')} in v2.x\n` +
        `  The ${c.cyanBright('frodo app')} command in v2.x manages the new applications created using the new application templates in ForgeRock Identity Cloud. To manage oauth clients, use the ${c.cyanBright('frodo oauth client')} command.\n\n` +
        `Usage Examples:\n` +
        `  Import all applications from a single export file using a connection profile:\n` +
        c.cyanBright(
          `  $ frodo app import -a -f ./allAlphaApplications.application.json ${s.connId}\n`
        ) +
        `  Import the first application from a single export file:\n` +
        c.cyanBright(
          `  $ frodo app import -f ./allAlphaApplications.application.json ${s.connId}\n`
        ) +
        `  Import all applications from separate export files:\n` +
        c.cyanBright(`  $ frodo app import -A ${s.connId}\n`) +
        `  Import all applications without dependencies from a single export file:\n` +
        c.cyanBright(
          `  $ frodo app import --no-deps -a -f ./allAlphaApplications.application.json ${s.connId}\n`
        ) +
        `  Import only the application 'myApp' from a file with an export file containing multiple applications:\n` +
        c.cyanBright(
          `  $ frodo app import -i myApp -f ./allAlphaApplications.application.json ${s.connId}\n`
        )
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
          options.file &&
          (options.appId || options.appName) &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing application "${options.appName ?? options.appId}"...`
          );
          const outcome = await importApplicationFromFile(
            options.appId,
            options.appName,
            options.file,
            {
              deps: options.deps,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing all applications from a single file (${options.file})...`
          );
          const outcome = await importApplicationsFromFile(options.file, {
            deps: options.deps,
          });
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          !options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            'Importing all applications from separate files in current directory...'
          );
          const outcome = await importApplicationsFromFiles({
            deps: options.deps,
          });
          if (!outcome) process.exitCode = 1;
        }
        // import first provider from file
        else if (
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing first application from file "${options.file}"...`
          );
          const outcome = await importFirstApplicationFromFile(options.file, {
            deps: options.deps,
          });
          if (!outcome) process.exitCode = 1;
        }
        // unrecognized combination of options or no options
        else {
          printMessage('Unrecognized combination of options or no options...');
          program.help();
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
