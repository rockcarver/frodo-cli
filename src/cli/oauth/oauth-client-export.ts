import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportOAuth2ClientsToFile,
  exportOAuth2ClientsToFiles,
  exportOAuth2ClientToFile,
} from '../../ops/OAuth2ClientOps';
import { verboseMessage } from '../../utils/Console.js';
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
    'frodo oauth client export',
    [],
    deploymentTypes
  );

  program
    .description('Export OAuth2 clients.')
    .addOption(
      new Option(
        '-i, --app-id <app-id>',
        'App id. If specified, -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
    .addOption(
      new Option(
        '-a, --all',
        'Export all OAuth2 apps to a single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all OAuth2 apps to separate files (*.oauth2.app.json) in the current directory. Ignored with -i or -a.'
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
          verboseMessage('Exporting OAuth2 client...');
          const outcome = await exportOAuth2ClientToFile(
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
          verboseMessage('Exporting all OAuth2 clients to file...');
          const outcome = await exportOAuth2ClientsToFile(
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
          verboseMessage('Exporting all clients to separate files...');
          const outcome = await exportOAuth2ClientsToFiles(options.metadata, {
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
