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

const { CLASSIC_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLASSIC_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo server export', [], deploymentTypes);

  program
    .description('Export servers.')
    .addOption(
      new Option(
        '-i, --server-id <server-id>',
        'Server id. Cannot be used with -u, -a or -A.'
      ).conflicts(['serverUrl', 'all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-u, --server-url <server-url>',
        'Server url. Can be a unique substring of the full url (if not unique, it will error out). Cannot be used with -i, -a or -A.'
      ).conflicts(['serverId', 'all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Name of the export file. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all servers to a single file. Cannot be used with -i, -u or -A.'
      ).conflicts(['serverId', 'serverUrl', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all servers to separate files (*.server.json) in the current directory. Cannot be used with -i, -u, -f or -a.'
      ).conflicts(['serverId', 'serverUrl', 'file', 'all'])
    )
    .addOption(
      new Option(
        '-x, --no-extract',
        'Do not extract the server properties from the exported file to a separate file.'
      ).default(true, 'true')
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
    .requireOneOf({
      options: ['all', 'allSeparate', 'serverId', 'serverUrl'],
      purpose: 'what to export',
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
            false,
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
          process.exitCode = 1;
          program.help();
        }
      }
      // end command logic inside action handler
    );

  return program;
}
