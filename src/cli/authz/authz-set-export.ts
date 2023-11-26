import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  exportPolicySetsToFile,
  exportPolicySetsToFiles,
  exportPolicySetToFile,
} from '../../ops/PolicySetOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo authz set export');

program
  .description('Export authorization policy sets.')
  .addOption(
    new Option(
      '-i, --set-id <set-id>',
      'Policy set id/name. If specified, -a and -A are ignored.'
    )
  )
  .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
  .addOption(
    new Option(
      '-a, --all',
      'Export all applications/policy sets to a single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export all applications/policy sets to separate files (*.authz.json) in the current directory. Ignored with -i or -a.'
    )
  )
  .addOption(
    new Option(
      '--no-deps',
      'Do not include any dependencies (policies, scripts).'
    )
  )
  .addOption(new Option('--prereqs', 'Include prerequisites (resource types).'))
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
      // export
      if (options.setId && (await getTokens())) {
        verboseMessage('Exporting authorization policy set to file...');
        const outcome = await exportPolicySetToFile(
          options.setId,
          options.file,
          {
            useStringArrays: true,
            deps: options.deps,
            prereqs: options.prereqs,
          }
        );
        if (!outcome) process.exitCode = 1;
      }
      // -a/--all
      else if (options.all && (await getTokens())) {
        verboseMessage('Exporting all authorization policy sets to file...');
        const outcome = await exportPolicySetsToFile(options.file, {
          useStringArrays: true,
          deps: options.deps,
          prereqs: options.prereqs,
        });
        if (!outcome) process.exitCode = 1;
      }
      // -A/--all-separate
      else if (options.allSeparate && (await getTokens())) {
        verboseMessage(
          'Exporting all authorization policy sets to separate files...'
        );
        const outcome = await exportPolicySetsToFiles({
          useStringArrays: true,
          deps: options.deps,
          prereqs: options.prereqs,
        });
        if (!outcome) process.exitCode = 1;
      }
      // unrecognized combination of options or no options
      else {
        verboseMessage('Unrecognized combination of options or no options...');
        program.help();
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
