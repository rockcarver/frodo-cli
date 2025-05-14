import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { deleteMapping, deleteMappings } from '../../ops/MappingOps';
import { printMessage, verboseMessage } from '../../utils/Console';
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
  const program = new FrodoCommand('frodo mapping delete', [], deploymentTypes);

  program
    .description('Delete IDM mappings.')
    .addOption(
      new Option(
        '-i, --mapping-id <mapping-id>',
        'Mapping id. If specified, -a is ignored.'
      )
    )
    .addOption(
      new Option(
        '-c, --connector-id <connector-id>',
        'Connector id. If specified, limits mappings to that particular connector; Ignored with -i.'
      )
    )
    .addOption(
      new Option(
        '-t, --managed-object-type <managed-object-type>',
        'Managed object type. If specified, limits mappings to that particular managed object type. Ignored with -i.'
      )
    )
    .addOption(new Option('-a, --all', 'Delete all mappings. Ignored with -i.'))
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
        // delete by id/name
        if (
          options.mappingId &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(`Deleting mapping ${options.mappingId}...`);
          const outcome = await deleteMapping(options.mappingId);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          verboseMessage(`Deleting all mappings...`);
          const outcome = await deleteMappings(
            options.connectorId,
            options.managedObjectType
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
