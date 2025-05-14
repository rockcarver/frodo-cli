import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  importFirstPolicyFromFile,
  importPoliciesFromFile,
  importPoliciesFromFiles,
  importPolicyFromFile,
} from '../../ops/PolicyOps';
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
    'frodo authz policy import',
    [],
    deploymentTypes
  );

  program
    .description('Import authorization policies.')
    .addOption(
      new Option(
        '-i, --policy-id <policy-id>',
        'Policy id. If specified, only one policy is imported and the options -a and -A are ignored.'
      )
    )
    .addOption(
      new Option('--set-id <set-id>', 'Import policies into this policy set.')
    )
    .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
    .addOption(
      new Option(
        '-a, --all',
        'Import all policies from single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all policies from separate files (*.policy.authz.json) in the current directory. Ignored with -i or -a.'
      )
    )
    .addOption(
      new Option(
        '--no-deps',
        'Do not import dependencies (scripts) even if they are available in the import file.'
      )
    )
    .addOption(
      new Option(
        '--prereqs',
        'Import prerequisites (policy sets, resource types) if they are available in the import file.'
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
        // import
        if (
          options.policyId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Importing authorization policy from file...');
          const outcome = await importPolicyFromFile(
            options.policyId,
            options.file,
            {
              deps: options.deps,
              prereqs: options.prereqs,
              policySetName: options.setId,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // -a/--all
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Importing all authorization policies from file...');
          const outcome = await importPoliciesFromFile(options.file, {
            deps: options.deps,
            prereqs: options.prereqs,
            policySetName: options.setId,
          });
          if (!outcome) process.exitCode = 1;
        }
        // -A/--all-separate
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            'Importing all authorization policies from separate files...'
          );
          const outcome = await importPoliciesFromFiles({
            deps: options.deps,
            prereqs: options.prereqs,
            policySetName: options.setId,
          });
          if (!outcome) process.exitCode = 1;
        }
        // import first policy set from file
        else if (
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing first authorization policy from file "${options.file}"...`
          );
          const outcome = await importFirstPolicyFromFile(options.file, {
            deps: options.deps,
            prereqs: options.prereqs,
            policySetName: options.setId,
          });
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
