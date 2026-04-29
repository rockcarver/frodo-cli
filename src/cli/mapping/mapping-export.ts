import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportMappingsToFile,
  exportMappingsToFiles,
  exportMappingToFile,
} from '../../ops/MappingOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo mapping export', [], deploymentTypes);

  program
    .description('Export IDM mappings.')
    .addOption(
      new Option(
        '-i, --mapping-id <mapping-id>',
        'Mapping id. Cannot be used with -c, -t, -a or -A.'
      ).conflicts(['connectorId', 'managedObjectType', 'all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-c, --connector-id <connector-id>',
        'Connector id. If specified, limits mappings to that particular connector; Cannot be used with -i.'
      ).conflicts(['mappingId'])
    )
    .addOption(
      new Option(
        '-t, --managed-object-type <managed-object-type>',
        'Managed object type. If specified, limits mappings to that particular managed object type. Cannot be used with -i.'
      ).conflicts(['mappingId'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Export all mappings. Cannot be used with -i or -A.'
      ).conflicts(['mappingId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'Export file if -x or -a is provided. Cannot be used with -A.'
      ).conflicts(['allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all mappings into separate JSON files in directory -D. Cannot be used with -i, -f or -a.'
      ).conflicts(['mappingId', 'file', 'all'])
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
        '-x, --no-extract',
        'Do not extract and save idm scripts to separate files. Cannot be used with -a.'
      ).default(true, 'true')
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'mappingId'],
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
            options.extract,
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
        // No branch ran: with requireOneOf satisfied, the only way
        // here is getTokens() failing -- keep the old exit-1 semantics
        // (the removed else handled auth failure too).
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
