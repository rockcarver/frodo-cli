import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  importFirstOAuth2ClientFromFile,
  importOAuth2ClientFromFile,
  importOAuth2ClientsFromFile,
  importOAuth2ClientsFromFiles,
} from '../../ops/OAuth2ClientOps';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo oauth client import',
    [],
    deploymentTypes
  );

  program
    .description('Import OAuth2 clients.')
    .addOption(
      new Option(
        '-i, --app-id <id>',
        'Client id. If specified, only one client is imported and the options -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
    .addOption(
      new Option(
        '-a, --all',
        'Import all clients from single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all clients from separate files (*.app.json) in the current directory. Ignored with -i or -a.'
      )
    )
    .addOption(
      new Option('--no-deps', 'Do not include any dependencies (scripts).')
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
        // import by id
        if (
          options.file &&
          options.appId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(`Importing OAuth2 client "${options.appId}"...`);
          const outcome = await importOAuth2ClientFromFile(
            options.appId,
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
            `Importing all OAuth2 clients from a single file (${options.file})...`
          );
          const outcome = await importOAuth2ClientsFromFile(options.file, {
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
            'Importing all OAuth2 clients from separate files in current directory...'
          );
          const outcome = await importOAuth2ClientsFromFiles({
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
            `Importing first OAuth2 client from file "${options.file}"...`
          );
          const outcome = await importFirstOAuth2ClientFromFile(options.file, {
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
