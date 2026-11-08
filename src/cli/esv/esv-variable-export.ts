import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportVariablesToFile,
  exportVariablesToFiles,
  exportVariableToFile,
} from '../../ops/cloud/VariablesOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv variable export',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Export variables.')
    .addOption(
      new Option(
        '-i, --variable-id <variable-id>',
        'Variable id. Cannot be used with -a or -A.'
      ).conflicts(['all', 'allSeparate'])
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
        'Export all variables to a single file. Cannot be used with -i or -A.'
      ).conflicts(['variableId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all variables to separate files (*.variable.json) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['variableId', 'file', 'all'])
    )
    .addOption(
      new Option(
        '--no-decode',
        'Do not include decoded variable value in export'
      ).default(false, 'false')
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
      options: ['all', 'allSeparate', 'variableId'],
      purpose: 'what to export',
    })
    .multiOp()
    .action(
      // implement command logic inside action handler
      async (host, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          user,
          password,
          options,
          command
        );
        // The login comes first: a variable that was not given is asked for
        // by the framework once it worked (a variable picker, record 0038),
        // and a declined pick makes getTokens fail.
        if (await getTokens(false, true, deploymentTypes)) {
          if (options.variableId) {
            verboseMessage(
              `Exporting variable "${
                options.variableId
              }" from realm "${state.getRealm()}"...`
            );
            const outcome = await exportVariableToFile(
              options.variableId,
              options.file,
              options.decode,
              options.metadata,
              options.modifiedProperties
            );
            if (!outcome) process.exitCode = 1;
          } else if (options.all) {
            verboseMessage('Exporting all variables to a single file...');
            const outcome = await exportVariablesToFile(
              options.file,
              options.decode,
              options.metadata,
              options.modifiedProperties
            );
            if (!outcome) process.exitCode = 1;
          } else if (options.allSeparate) {
            verboseMessage('Exporting all variables to separate files...');
            const outcome = await exportVariablesToFiles(
              options.decode,
              options.metadata,
              options.modifiedProperties,
              options.allowFailures
            );
            if (!outcome) process.exitCode = 1;
          } else {
            // none of -i, -a and -A: the picker had no variable to offer
            printMessage('There is no variable to choose from.', 'error');
            process.exitCode = 1;
          }
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
