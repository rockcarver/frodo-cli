import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportMappingsToFile,
  exportMappingsToFiles,
  exportMappingToFile,
} from '../../ops/MappingOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  IDM_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  IDM_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo mapping export', [], deploymentTypes);

  program
    .description('Export IDM mappings.')
    .addOption(
      new Option(
        '-i, --mapping-id <mapping-id>',
        'Mapping id. If specified, -a is ignored.'
      )
    )
    .addOption(
      new Option(
        '-c, --connector-id <connector-id>',
        'Connector id. If specified, limits mappings to that particular connector; Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-t, --managed-object-type <managed-object-type>',
        'Managed object type. If specified, limits mappings to that particular managed object type. Ignored with -i.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Export file. Ignored with -A.'))
    .addOption(new Option('-a, --all', 'Export all mappings. Ignored with -i.'))
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all mappings into separate JSON files in directory -D. Ignored with -i and -a.'
      )
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .addOption(
      new Option('--no-deps', 'Do not include any dependencies in export.')
    )
    .addOption(
      new Option(
        '--use-string-arrays',
        'Where applicable, use string arrays to store multi-line text (e.g. scripts).'
      ).default(false, 'off')
    )

    .addOption(
      new Option(
        '-x, --extract',
        'Extract the script from the exported file, and save it to a separate file. Ignored with -a.'
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
        // export by id/name
        if (
          options.mappingId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(`Exporting mapping ${options.mappingId}...`);
          const outcome = await exportMappingToFile(
            options.mappingId,
            options.file,
            options.metadata,
            {
              deps: options.deps,
              useStringArrays: options.useStringArrays,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(`Exporting all mappings to a single file...`);
          const outcome = await exportMappingsToFile(
            options.file,
            options.metadata,
            {
              connectorId: options.connectorId,
              moType: options.managedObjectType,
              deps: options.deps,
              useStringArrays: options.useStringArrays,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all mappings to separate files...');
          const outcome = await exportMappingsToFiles(
            options.metadata,
            options.extract,
            {
              connectorId: options.connectorId,
              moType: options.managedObjectType,
              deps: options.deps,
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
          program.help();
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
