import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  exportPoliciesByPolicySetToFile,
  exportPoliciesByPolicySetToFiles,
  exportPoliciesToFile,
  exportPoliciesToFiles,
  exportPolicyToFile,
} from '../../ops/PolicyOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo authz policy export');

program
  .description('Export authorization policies.')
  .addOption(
    new Option(
      '-i, --policy-id <policy-id>',
      'Policy id. If specified, -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '--set-id <set-id>',
      'Export policies in policy set only. Ignored with -i.'
    )
  )
  .addOption(new Option('-f, --file <file>', 'Name of the export file.'))
  .addOption(
    new Option(
      '-a, --all',
      'Export policies to a single file. Ignored with -i.'
    )
  )
  .addOption(
    new Option(
      '-A, --all-separate',
      'Export policies to separate files (*.policy.authz.json) in the current directory. Ignored with -i or -a.'
    )
  )
  .addOption(new Option('--no-deps', 'Do not include dependencies (scripts).'))
  .addOption(
    new Option(
      '--prereqs',
      'Include prerequisites (policy sets, resource types).'
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
      // export
      if (options.policyId && (await getTokens())) {
        verboseMessage('Exporting authorization policy to file...');
        const outcome = await exportPolicyToFile(
          options.policyId,
          options.file,
          {
            deps: options.deps,
            prereqs: options.prereqs,
            useStringArrays: true,
          }
        );
        if (!outcome) process.exitCode = 1;
      }
      // -a/--all by policy set
      else if (options.setId && options.all && (await getTokens())) {
        verboseMessage(
          `Exporting all authorization policies in policy set ${options.setId} to file...`
        );
        const outcome = await exportPoliciesByPolicySetToFile(
          options.setId,
          options.file,
          {
            deps: options.deps,
            prereqs: options.prereqs,
            useStringArrays: true,
          }
        );
        if (!outcome) process.exitCode = 1;
      }
      // -a/--all
      else if (options.all && (await getTokens())) {
        verboseMessage('Exporting all authorization policies to file...');
        const outcome = await exportPoliciesToFile(options.file, {
          deps: options.deps,
          prereqs: options.prereqs,
          useStringArrays: true,
        });
        if (!outcome) process.exitCode = 1;
      }
      // -A/--all-separate by policy set
      else if (options.setId && options.allSeparate && (await getTokens())) {
        verboseMessage(
          `Exporting all authorization policies in policy set ${options.setId} to separate files...`
        );
        const outcome = await exportPoliciesByPolicySetToFiles(options.setId, {
          deps: options.deps,
          prereqs: options.prereqs,
          useStringArrays: true,
        });
        if (!outcome) process.exitCode = 1;
      }
      // -A/--all-separate
      else if (options.allSeparate && (await getTokens())) {
        verboseMessage(
          'Exporting all authorization policies to separate files...'
        );
        const outcome = await exportPoliciesToFiles({
          deps: options.deps,
          prereqs: options.prereqs,
          useStringArrays: true,
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
