import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  importFirstServerFromFile,
  importServerFromFile,
  importServersFromFile,
  importServersFromFiles,
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
  const program = new FrodoCommand('frodo server import', [], deploymentTypes);

  program
    .description('Import servers.')
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
        'Name of the file to import. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Import all servers from single file. Cannot be used with -i, -u or -A.'
      ).conflicts(['serverId', 'serverUrl', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all servers from separate files (*.server.json) in the current directory. Cannot be used with -i, -u, -f or -a.'
      ).conflicts(['serverId', 'serverUrl', 'file', 'all'])
    )
    .addOption(
      new Option(
        '-d, --default',
        'Import server(s) along with the default server properties.'
      )
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'file', 'serverId', 'serverUrl'],
      purpose: 'what to import',
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
        // import by id or url
        if (
          (options.serverId || options.serverUrl) &&
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing server ${options.serverId || options.serverUrl}...`
          );
          const outcome = await importServerFromFile(
            options.serverId,
            options.serverUrl,
            options.file,
            {
              includeDefault: options.default,
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
            `Importing all servers from a single file (${options.file})...`
          );
          const outcome = await importServersFromFile(options.file, {
            includeDefault: options.default,
          });
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Importing all servers from separate files...');
          const outcome = await importServersFromFiles({
            includeDefault: options.default,
          });
          if (!outcome) process.exitCode = 1;
        }
        // import first server in file
        else if (
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Importing first server in file...');
          const outcome = await importFirstServerFromFile(options.file, {
            includeDefault: options.default,
          });
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
