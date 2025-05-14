import { frodo } from '@rockcarver/frodo-lib';
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
    'frodo authz type export',
    [],
    deploymentTypes
  );

  program
    .description('Export authorization resource types.')
    .addOption(
      new Option(
        '-i, --type-id <type-uuid>',
        'Resource type uuid. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-n, --type-name <type-name>',
        'Resource type name. If specified, -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
    .addOption(
      new Option(
        '-a, --all',
        'Export all resource types to a single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all resource types to separate files (*.resourcetype.authz.json) in the current directory. Ignored with -i, -n, or -a.'
      )
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
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
        // export by uuid
        if (options.typeId && (await getTokens(false, true, deploymentTypes))) {
          verboseMessage('Exporting authorization resource type to file...');
          const outcome = await exportResourceTypeToFile(
            options.typeId,
            options.file,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
        }
        // export by name
        else if (
          options.typeName &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting authorization resource type to file...');
          const outcome = await exportResourceTypeByNameToFile(
            options.typeName,
            options.file,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
        }
        // -a/--all
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            'Exporting all authorization resource types to file...'
          );
          const outcome = await exportResourceTypesToFile(
            options.file,
            options.metadata
          );
          if (!outcome) process.exitCode = 1;
        }
        // -A/--all-separate
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            'Exporting all authorization resource types to separate files...'
          );
          const outcome = await exportResourceTypesToFiles(options.metadata);
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
