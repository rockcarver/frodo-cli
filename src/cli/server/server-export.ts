import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportServersToFile,
  exportServersToFiles,
  exportServerToFile,
} from '../../ops/classic/ServerOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLASSIC_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLASSIC_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand('frodo server export', [], deploymentTypes);

  program
    .description('Export servers.')
    .addOption(
      new Option(
        '-i, --server-id <server-id>',
        'Server id. If specified, only one server is exported and the options -u, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-u, --server-url <server-url>',
        'Server url. Can be a unique substring of the full url (if not unique, it will error out). If specified, only one server is exported and the options -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
    .addOption(
      new Option(
        '-a, --all',
        'Export all servers to a single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all servers to separate files (*.server.json) in the current directory. Ignored with -i or -a.'
      )
    )
    .addOption(
      new Option(
        '-x, --extract',
        'Extract scripts and server properties from the exported file, and save it to a separate file. Ignored with -a.'
      )
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .addOption(
      new Option(
        '-d, --default',
        'Export server(s) along with the default server properties.'
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
        // export by id or url
        if (
          (options.serverId || options.serverUrl) &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Exporting server ${options.serverId || options.serverUrl}...`
          );
          const outcome = await exportServerToFile(
            options.serverId,
            options.serverUrl,
            options.file,
            options.extract,
            options.metadata,
            {
              includeDefault: options.default,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(`Exporting all servers to a single file...`);
          const outcome = await exportServersToFile(
            options.file,
            options.extract,
            options.metadata,
            {
              includeDefault: options.default,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all servers to separate files...');
          const outcome = await exportServersToFiles(
            options.extract,
            options.metadata,
            {
              includeDefault: options.default,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // unrecognized combination of options or no options
        else {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
          program.help();
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
