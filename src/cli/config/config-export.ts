import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportEverythingToFile,
  exportEverythingToFiles,
} from '../../ops/ConfigOps';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config export');

  program
    .description(
      'Export full cloud configuration for all ops that currently support export.'
    )
    .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
    .addOption(new Option('-a, --all', 'Export everything to a single file.'))
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export everything to separate files in the -D directory. Ignored with -a.'
      )
    )
    .addOption(
      new Option(
        '--use-string-arrays',
        'Where applicable, use string arrays to store multi-line text (e.g. scripts).'
      ).default(false, 'off')
    )
    .addOption(
      new Option(
        '--no-decode',
        'Do not include decoded variable value in variable export'
      ).default(false, 'false')
    )
    .addOption(
      new Option(
        '-x, --extract',
        'Extract scripts from the exported file, and save it to a separate file. Ignored with -a.'
      )
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    .addOption(
      new Option(
        '--no-coords',
        'Do not include the x and y coordinate positions of the journey/tree nodes.'
      )
    )
    .addOption(
      new Option(
        '-d, --default',
        'Export all scripts including the default scripts.'
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
        // --all -a
        if (options.all && (await getTokens())) {
          verboseMessage('Exporting everything to a single file...');
          const outcome = await exportEverythingToFile(
            options.file,
            options.metadata,
            {
              useStringArrays: options.useStringArrays,
              noDecode: options.decode,
              coords: options.coords,
              includeDefault: options.default,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // require --directory -D for all-separate function
        else if (options.allSeparate && !state.getDirectory()) {
          printMessage(
            '-D or --directory required when using -A or --all-separate',
            'error'
          );
          program.help();
          process.exitCode = 1;
        }
        // --all-separate -A
        else if (options.allSeparate && (await getTokens())) {
          verboseMessage('Exporting everything to separate files...');
          const outcome = await exportEverythingToFiles(
            options.extract,
            options.metadata,
            {
              useStringArrays: options.useStringArrays,
              noDecode: options.decode,
              coords: options.coords,
              includeDefault: options.default,
            }
          );
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
