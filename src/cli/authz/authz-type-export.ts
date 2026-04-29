import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportResourceTypeByNameToFile,
  exportResourceTypesToFile,
  exportResourceTypesToFiles,
  exportResourceTypeToFile,
} from '../../ops/ResourceTypeOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo authz type export');

  program
    .description('Export authorization resource types.')
    .addOption(
      new Option(
        '-i, --type-id <type-uuid>',
        'Resource type uuid. Cannot be used with -n, -a or -A.'
      ).conflicts(['typeName', 'all', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-n, --type-name <type-name>',
        'Resource type name. Cannot be used with -i, -a or -A.'
      ).conflicts(['typeId', 'all', 'allSeparate'])
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
        'Export all resource types to a single file. Cannot be used with -i, -n or -A.'
      ).conflicts(['typeId', 'typeName', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all resource types to separate files (*.resourcetype.authz.json) in the current directory. Cannot be used with -i, -n, -f or -a.'
      ).conflicts(['typeId', 'typeName', 'file', 'all'])
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .addOption(
      new Option(
        '-M, --modified-properties',
        'Include modified properties in export (e.g. lastModifiedDate, lastModifiedBy, createdBy, creationDate, etc.)'
      ).default(false, 'false')
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'typeId', 'typeName'],
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
        // export by uuid
        if (options.typeId && (await getTokens())) {
          verboseMessage('Exporting authorization resource type to file...');
          const outcome = await exportResourceTypeToFile(
            options.typeId,
            options.file,
            options.metadata,
            options.modifiedProperties
          );
          if (!outcome) process.exitCode = 1;
        }
        // export by name
        else if (options.typeName && (await getTokens())) {
          verboseMessage('Exporting authorization resource type to file...');
          const outcome = await exportResourceTypeByNameToFile(
            options.typeName,
            options.file,
            options.metadata,
            options.modifiedProperties
          );
          if (!outcome) process.exitCode = 1;
        }
        // -a/--all
        else if (options.all && (await getTokens())) {
          verboseMessage(
            'Exporting all authorization resource types to file...'
          );
          const outcome = await exportResourceTypesToFile(
            options.file,
            options.metadata,
            options.modifiedProperties
          );
          if (!outcome) process.exitCode = 1;
        }
        // -A/--all-separate
        else if (options.allSeparate && (await getTokens())) {
          verboseMessage(
            'Exporting all authorization resource types to separate files...'
          );
          const outcome = await exportResourceTypesToFiles(
            options.metadata,
            options.modifiedProperties
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
