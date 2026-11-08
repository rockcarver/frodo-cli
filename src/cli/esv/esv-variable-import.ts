import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import {
  importVariableFromFile,
  importVariablesFromFile,
  importVariablesFromFiles,
} from '../../ops/cloud/VariablesOps';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv variable import',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Import variables.')
    .addOption(
      new Option(
        '-i, --variable-id <variable-id>',
        'Variable id. Cannot be used with -a or -A.'
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
        'Import all variables from single file. Cannot be used with -i or -A.'
      ).conflicts(['variableId', 'allSeparate'])
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all variables from separate files (*.variable.json) in the current directory. Cannot be used with -i, -f or -a.'
      ).conflicts(['variableId', 'file', 'all'])
    )
    .requireOneOf({
      options: ['all', 'allSeparate', 'file', 'variableId'],
      purpose: 'what to import',
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
        // an unrecognized combination of options is refused before the login
        const importById = options.variableId;
        const importAll = options.all && options.file;
        const importAllSeparate = options.allSeparate && !options.file;
        if (!(importById || importAll || importAllSeparate || options.file)) {
          printMessage('Unrecognized combination of options or no options...');
          process.exitCode = 1;
          program.help();
          return;
        }
        // a failed login is a failure of its own, not an unrecognized combination of options
        if (!(await getTokens(false, true, deploymentTypes))) {
          process.exitCode = 1;
          return;
        }
        // import
        if (importById) {
          printMessage(`Importing variable ${options.variableId}...`);
          const outcome = await importVariableFromFile(
            options.variableId,
            options.file
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (importAll) {
          printMessage(
            `Importing all variables from a single file (${options.file})...`
          );
          const outcome = await importVariablesFromFile(
            options.file,
            options.allowFailures
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all-separate -A
        else if (importAllSeparate) {
          printMessage(
            'Importing all variables from separate files in working directory...'
          );
          const outcome = await importVariablesFromFiles(options.allowFailures);
          if (!outcome) process.exitCode = 1;
        }
        // import first
        else {
          printMessage('Importing first variable in file...');
          const outcome = await importVariableFromFile(null, options.file);
          if (!outcome) process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
