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

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo mapping import', [], deploymentTypes);

  program
    .description('Import IDM mappings.')
    .addOption(
      new Option(
        '-i, --mapping-id <mapping-id>',
        'Mapping id. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
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
        'Import all mappings from single file. Cannot be used with -i or -A.'
      ).conflicts(['mappingId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all mappings from separate files (*.sync.json or *.mapping.json) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['mappingId', 'file', 'all'])
    )
    .addOption(new Option('--no-deps', 'Do not include any dependencies.'))
    .requireOneOf({
      options: ['all', 'allSeparate', 'file', 'mappingId'],
      purpose: 'what to import',
    })
    .multiOp()
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
        // unrecognized combination of options (-a needs -f) or no options
        if (!(options.mappingId || options.allSeparate || options.file)) {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
          process.exitCode = 1;
          program.help();
        }
        // a failed login has printed its reason: that is the whole answer
        else if (!(await getTokens(false, true, deploymentTypes))) {
          process.exitCode = 1;
        }
        // import by id/name
        else if (options.mappingId) {
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
        else if (options.all && options.file) {
          verboseMessage(
            `Importing all mappings from a single file (${options.file})...`
          );
          const outcome = await importMappingsFromFile(
            options.file,
            {
              deps: options.deps,
            },
            options.allowFailures
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (options.allSeparate) {
          verboseMessage('Importing all mappings from separate files...');
          const outcome = await importMappingsFromFiles(
            {
              deps: options.deps,
            },
            options.allowFailures
          );
          if (!outcome) process.exitCode = 1;
        }
        // import first mapping in file
        else {
          verboseMessage('Importing first mapping in file...');
          const outcome = await importFirstMappingFromFile(options.file, {
            deps: options.deps,
          });
          if (!outcome) process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
