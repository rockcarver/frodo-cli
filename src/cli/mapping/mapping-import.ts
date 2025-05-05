import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  importFirstMappingFromFile,
  importMappingFromFile,
  importMappingsFromFile,
  importMappingsFromFiles,
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
  const program = new FrodoCommand('frodo mapping import', [], deploymentTypes);

  program
    .description('Import IDM mappings.')
    .addOption(
      new Option(
        '-i, --mapping-id <mapping-id>',
        'Mapping id. If specified, only one mapping is imported and the options -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the file to import'))
    .addOption(
      new Option(
        '-a, --all',
        'Import all mappings from single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all mappings from separate files (*.sync.json or *.mapping.json) in the current directory. Ignored with -i and -a.'
      )
    )
    .addOption(new Option('--no-deps', 'Do not include any dependencies.'))
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
        // import by id/name
        if (
          options.mappingId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(`Importing mapping ${options.mappingId}...`);
          const outcome = await importMappingFromFile(
            options.mappingId,
            options.file,
            {
              deps: options.deps,
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
            `Importing all mappings from a single file (${options.file})...`
          );
          const outcome = await importMappingsFromFile(options.file, {
            deps: options.deps,
          });
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Importing all mappings from separate files...');
          const outcome = await importMappingsFromFiles({
            deps: options.deps,
          });
          if (!outcome) process.exitCode = 1;
        }
        // import first mapping in file
        else if (
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Importing first mapping in file...');
          const outcome = await importFirstMappingFromFile(options.file, {
            deps: options.deps,
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
      }
      // end command logic inside action handler
    );

  return program;
}
