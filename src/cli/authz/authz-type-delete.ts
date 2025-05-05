import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  deleteResourceTypeById,
  deleteResourceTypes,
  deleteResourceTypeUsingName,
} from '../../ops/ResourceTypeOps';
import { printMessage, verboseMessage } from '../../utils/Console.js';
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
    'frodo authz type delete',
    [],
    deploymentTypes
  );

  program
    .description('Delete authorization resource types.')
    .addOption(
      new Option(
        '-i, --type-id <type-id>',
        'Variable id. If specified, -a is ignored.'
      )
    )
    .addOption(
      new Option(
        '-n, --type-name <type-name>',
        'Resource type name. If specified, -a is ignored.'
      )
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all resource types in a realm. Ignored with -i and -n.'
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
        // delete by uuid
        if (options.typeId && (await getTokens(false, true, deploymentTypes))) {
          verboseMessage('Deleting authorization resource type...');
          const outcome = await deleteResourceTypeById(options.typeId);
          if (!outcome) process.exitCode = 1;
        }
        // delete by name
        else if (
          options.typeName &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Deleting authorization resource type...');
          const outcome = await deleteResourceTypeUsingName(options.typeName);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage('Deleting all authorization resource types...');
          const outcome = await deleteResourceTypes();
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
