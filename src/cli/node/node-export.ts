import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportCustomNodesToFile,
  exportCustomNodesToFiles,
  exportCustomNodeToFile,
} from '../../ops/NodeOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo node export');

  program
    .description('Export custom nodes.')
    .addOption(
      new Option(
        '-i, --node-id <node-id>',
        'Custom node id or service name. Cannot be used with -n, -a or -A.'
      ).conflicts(['nodeName', 'all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-n, --node-name <node-name>',
        'Custom node display name. Cannot be used with -i, -a or -A.'
      ).conflicts(['nodeId', 'all', 'allSeparate'])
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
        'Export all custom nodes to a single file. Cannot be used with -i, -n and -A.'
      ).conflicts(['nodeId', 'nodeName', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all custom nodes to separate files (*.nodeTypes.json) in the current directory. Cannot be used with -i, -n, -f or -a.'
      ).conflicts(['nodeId', 'nodeName', 'file', 'all'])
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .addOption(
      new Option(
        '-x, --no-extract',
        'Do not extract the script from the exported file to a separate file.'
      ).default(true, 'true')
    )
    .addOption(
      new Option(
        '--use-string-arrays',
        'Where applicable, use string arrays to store scripts.'
      ).default(false, 'off')
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'nodeId', 'nodeName'],
      purpose: 'what to export',
    })
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      // export by id or name
      if ((options.nodeId || options.nodeName) && (await getTokens())) {
        verboseMessage(
          `Exporting custom node ${options.nodeId || options.nodeName}...`
        );
        const outcome = await exportCustomNodeToFile(
          options.nodeId,
          options.nodeName,
          options.file,
          options.metadata,
          options.extract,
          {
            useStringArrays: options.useStringArrays,
          }
        );
        if (!outcome) process.exitCode = 1;
      }
      // --all -a
      else if (options.all && (await getTokens())) {
        verboseMessage(`Exporting all custom nodes to a single file...`);
        const outcome = await exportCustomNodesToFile(
          options.file,
          options.metadata,
          {
            useStringArrays: options.useStringArrays,
          }
        );
        if (!outcome) process.exitCode = 1;
      }
      // --all-separate -A
      else if (options.allSeparate && (await getTokens())) {
        verboseMessage('Exporting all custom nodes to separate files...');
        const outcome = await exportCustomNodesToFiles(
          options.metadata,
          options.extract,
          {
            useStringArrays: options.useStringArrays,
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
    });

  return program;
}
