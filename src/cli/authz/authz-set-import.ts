import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  importFirstPolicySetFromFile,
  importPolicySetFromFile,
  importPolicySetsFromFile,
  importPolicySetsFromFiles,
} from '../../ops/PolicySetOps';
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
    'frodo authz set import',
    [],
    deploymentTypes
  );

  program
    .description('Import authorization policy sets.')
    .addOption(
      new Option(
        '-i, --set-id <set-id>',
        'Policy set id/name. If specified, only one policy set is imported and the options -a and -A are ignored.'
      )
    )
    .addOption(new Option('-f, --file <file>', 'Name of the file to import.'))
    .addOption(
      new Option(
        '-a, --all',
        'Import all policy sets from single file. Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-A, --all-separate',
        'Import all policy sets from separate files (*.policyset.authz.json) in the current directory. Ignored with -i or -a.'
      )
    )
    .addOption(
      new Option(
        '--no-deps',
        'Do not include any dependencies (policies, scripts).'
      )
    )
    .addOption(
      new Option('--prereqs', 'Include prerequisites (resource types).')
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
        if (options.setId && (await getTokens(false, true, deploymentTypes))) {
          verboseMessage('Importing authorization policy set from file...');
          const outcome = await importPolicySetFromFile(
            options.setId,
            options.file,
            {
              deps: options.deps,
              prereqs: options.prereqs,
            }
          );
          if (!outcome) process.exitCode = 1;
        }
        // -a/--all
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            'Importing all authorization policy sets from file...'
          );
          const outcome = await importPolicySetsFromFile(options.file, {
            deps: options.deps,
            prereqs: options.prereqs,
          });
          if (!outcome) process.exitCode = 1;
        }
        // -A/--all-separate
        else if (
          options.allSeparate &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            'Importing all authorization policy sets from separate files...'
          );
          const outcome = await importPolicySetsFromFiles({
            deps: options.deps,
            prereqs: options.prereqs,
          });
          if (!outcome) process.exitCode = 1;
        }
        // import first policy set from file
        else if (
          options.file &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(
            `Importing first authorization policy set from file "${options.file}"...`
          );
          const outcome = await importFirstPolicySetFromFile(options.file, {
            deps: options.deps,
            prereqs: options.prereqs,
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
