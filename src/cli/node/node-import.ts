import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  importCustomNodeFromFile,
  importCustomNodesFromFile,
  importCustomNodesFromFiles,
  importFirstCustomNodeFromFile,
} from '../../ops/NodeOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo node import');
  program
    .description('Import custom nodes.')
    .addOption(
      new Option(
        '-i, --node-id <node-id>',
        'Custom node id or service name. If specified, only one custom node is imported and the options -n, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-n, --node-name <node-name>',
        'Custom node display name. If specified, only one custom node is imported and the options -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
    .addOption(
      new Option(
        '-a, --all',
        'Import all custom nodes from single file. Ignored with -i or -n.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all custom nodes from separate files (*.nodeTypes.json) in the current directory. Ignored with -i, -n, or -a.'
      )
    )
    .addOption(
      new Option(
        '--re-uuid',
        'Re-UUID. Create a new UUID (and service name) for the custom node upon import. Use this to duplicate a custom node or create a new version of the same custom node. Note that you must also choose a new display name using -n/--node-name to avoid import errors.'
      ).default(false, 'false')
    )
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      // import by id or name
      if (
        (options.nodeId || options.nodeName) &&
        options.file &&
        (await getTokens())
      ) {
        verboseMessage(
          `Importing custom node ${options.nodeId || options.nodeName}...`
        );
        const outcome = await importCustomNodeFromFile(
          options.nodeId,
          options.nodeName,
          options.file,
          {
            reUuid: options.reUuid,
            wait: false,
          }
        );
        if (!outcome) process.exitCode = 1;
      }
      // --all -a
      else if (options.all && options.file && (await getTokens())) {
        verboseMessage(
          `Importing all custom nodes from a single file (${options.file})...`
        );
        const outcome = await importCustomNodesFromFile(options.file, {
          reUuid: options.reUuid,
          wait: false,
        });
        if (!outcome) process.exitCode = 1;
      }
      // --all-separate -A
      else if (options.allSeparate && (await getTokens())) {
        verboseMessage('Importing all custom nodes from separate files...');
        const outcome = await importCustomNodesFromFiles({
          reUuid: options.reUuid,
          wait: false,
        });
        if (!outcome) process.exitCode = 1;
      }
      // import first node in file
      else if (options.file && (await getTokens())) {
        verboseMessage('Importing first custom node in file...');
        const outcome = await importFirstCustomNodeFromFile(options.file, {
          reUuid: options.reUuid,
          wait: false,
        });
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
    });
  return program;
}
