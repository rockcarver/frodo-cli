import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { renameMapping, renameMappings } from '../../ops/MappingOps';
import { printMessage, verboseMessage } from '../../utils/Console.js';
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
  const program = new FrodoCommand('frodo mapping rename', [], deploymentTypes);

  program
    .description(
      'Renames mappings from the combined/default/legacy naming scheme (sync/<name>) to the separate/new naming scheme (mapping/<name>). To rename mappings from new back to legacy, use the -l, --legacy flag.'
    )
    .addOption(
      new Option(
        '-i, --mapping-id <mapping-id>',
        "Mapping id/name. If specified, -a is ignored. The mapping's order is lost through renaming, and relies on the default ordering of wherever it ends up (usually that means it ends up last in sync order)"
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Rename all mappings. Ignored with -i. Ordering is preserved through this renaming process, according to the order of the mappings before renaming.'
      )
    )
    .addOption(
      new Option(
        '-l, --legacy',
        'Rename all mappings from the new naming scheme back to the legacy naming scheme.'
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
        // rename by id/name
        if (
          options.mappingId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Renaming mapping...');
          const outcome = await renameMapping(
            options.mappingId,
            options.legacy
          );
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Renaming all mappings...');
          const outcome = await renameMappings(options.legacy);
          if (!outcome) process.exitCode = 1;
        }
        // unrecognized combination of options or no options
        else {
          printMessage('Unrecognized combination of options or no options...');
          program.help();
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
