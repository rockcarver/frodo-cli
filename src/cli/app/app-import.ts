import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import {
  importApplicationFromFile,
  importApplicationsFromFile,
  importApplicationsFromFiles,
  importFirstApplicationFromFile,
} from '../../ops/ApplicationOps';
import { getTokens } from '../../ops/AuthenticateOps';
import c from '../../utils/ColorTheme';
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
        'Application id. Cannot be used with -n, -a or -A.'
      ).conflicts(['appName', 'all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-n, --app-name <name>',
        'Application name. Cannot be used with -i, -a or -A.'
      ).conflicts(['appId', 'all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the file to import. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all applications from single file. Cannot be used with -i, -n or -A.'
      ).conflicts(['appId', 'appName', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all applications from separate files (*.app.json) in the current directory. Cannot be used with -i, -n, -f or -a.'
      ).conflicts(['appId', 'appName', 'file', 'all'])
    )
    .addOption(
      new Option(
        '--no-deps',
        'Do not include any dependencies (scripts, OAuth2 clients, SAML providers, circles of trust, connectors, mappings, and on Identity Governance tenants the glossary and request forms).'
      )
    )
    .addHelpText(
      'after',
      c.warning(`Important Note:\n`) +
        `  The ${c.command('frodo app')} command to manage OAuth2 clients in v1.x has been renamed to ${c.command('frodo oauth client')} in v2.x\n` +
        `  The ${c.command('frodo app')} command in v2.x manages the new applications created using the new application templates in ForgeRock Identity Cloud. To manage oauth clients, use the ${c.command('frodo oauth client')} command.\n\n` +
        `Usage Examples:\n` +
        `  Import all applications from a single export file using a connection profile:\n` +
        c.command(
          `  $ frodo app import -a -f ./allAlphaApplications.application.json ${s.connId}\n`
        ) +
        `  Import the first application from a single export file:\n` +
        c.command(
          `  $ frodo app import -f ./allAlphaApplications.application.json ${s.connId}\n`
        ) +
        `  Import all applications from separate export files:\n` +
        c.command(`  $ frodo app import -A ${s.connId}\n`) +
        `  Import all applications without dependencies from a single export file:\n` +
        c.command(
          `  $ frodo app import --no-deps -a -f ./allAlphaApplications.application.json ${s.connId}\n`
        ) +
        `  Import only the application 'myApp' from a file with an export file containing multiple applications:\n` +
        c.command(
          `  $ frodo app import -i myApp -f ./allAlphaApplications.application.json ${s.connId}\n`
        )
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'appId', 'appName', 'file'],
      purpose: 'what to import',
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
        // decide what to do from the options alone, so that a failed login is
        // reported as such and not as an unrecognized combination of options
        let task:
          { message: () => string; run: () => Promise<boolean> } | undefined;
        // -i/--app-id or -n/--app-name
        if (options.file && (options.appId || options.appName)) {
          task = {
            message: () =>
              `Importing application "${options.appName ?? options.appId}"...`,
            run: () =>
              importApplicationFromFile(
                options.appId,
                options.appName,
                options.file,
                { deps: options.deps }
              ),
          };
        }
        // --all -a
        else if (options.all && options.file) {
          task = {
            message: () =>
              `Importing all applications from a single file (${options.file})...`,
            run: () =>
              importApplicationsFromFile(
                options.file,
                { deps: options.deps },
                options.allowFailures
              ),
          };
        }
        // --all-separate -A
        else if (options.allSeparate && !options.file) {
          task = {
            message: () =>
              'Importing all applications from separate files in current directory...',
            run: () =>
              importApplicationsFromFiles(
                { deps: options.deps },
                options.allowFailures
              ),
          };
        }
        // import first application from file
        else if (options.file) {
          task = {
            message: () =>
              `Importing first application from file "${options.file}"...`,
            run: () =>
              importFirstApplicationFromFile(options.file, {
                deps: options.deps,
              }),
          };
        }
        // unrecognized combination of options or no options
        else {
          printMessage('Unrecognized combination of options or no options...');
          process.exitCode = 1;
          program.help();
          return;
        }
        if (!(await getTokens(false, true, deploymentTypes))) {
          // getTokens has said why
          process.exitCode = 1;
          return;
        }
        verboseMessage(task.message());
        const outcome = await task.run();
        if (!outcome) process.exitCode = 1;
      }
      // end command logic inside action handler
    );

  return program;
}
