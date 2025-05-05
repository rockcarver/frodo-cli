import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  exportScriptByNameToFile,
  exportScriptsToFile,
  exportScriptsToFiles,
  exportScriptToFile,
} from '../../ops/ScriptOps';
import { printMessage, verboseMessage } from '../../utils/Console';
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
  const program = new FrodoCommand('frodo script export', [], deploymentTypes);

  program
    .description('Export scripts.')
    .addOption(
      new Option(
        '-i, --script-id <uuid>',
        'Uuid of the script. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option(
        '-n, --script-name <name>',
        'Name of the script. If specified, -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
    .addOption(
      new Option(
        '-a, --all',
        'Export all scripts to a single file. Ignored with -n.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Export all scripts to separate files (*.script.json) in the current directory. Ignored with -n or -a.'
      )
    )
    .addOption(
      new Option(
        '-N, --no-metadata',
        'Does not include metadata in the export file.'
      )
    )
    // deprecated option
    .addOption(
      new Option(
        '-s, --script <script>',
        'DEPRECATED! Use -n/--script-name instead. Name of the script.'
      )
    )
    .addOption(
      new Option(
        '-x, --extract',
        'Extract the script from the exported file, and save it to a separate file. Ignored with -a.'
      )
    )
    .addOption(
      new Option(
        '-d, --default',
        'Export all scripts including the default scripts. Ignored with -n.'
      )
    )
    .addOption(
      new Option(
        '--no-deps',
        'Do not include script dependencies (i.e. library scripts). Ignored with -a and -A.'
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
        // export by id
        if (
          options.scriptId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting script...');
          const outcome = await exportScriptToFile(
            options.scriptId,
            options.file,
            options.metadata,
            options.extract,
            {
              deps: options.deps,
              includeDefault: options.default,
              useStringArrays: true,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // export by name
        else if (
          (options.scriptName || options.script) &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting script...');
          const outcome = await exportScriptByNameToFile(
            options.scriptName || options.script,
            options.file,
            options.metadata,
            options.extract,
            {
              deps: options.deps,
              includeDefault: options.default,
              useStringArrays: true,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // -a / --all
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all scripts to a single file...');
          const outcome = await exportScriptsToFile(
            options.file,
            options.metadata,
            {
              deps: options.deps,
              includeDefault: options.default,
              useStringArrays: true,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // -A / --all-separate
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Exporting all scripts to separate files...');
          const outcome = await exportScriptsToFiles(
            options.extract,
            options.metadata,
            {
              deps: options.deps,
              includeDefault: options.default,
              useStringArrays: true,
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
