import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteMapping, deleteMappings } from '../../ops/MappingOps';
import { verboseMessage } from '../../utils/Console';
import {
  entityPick,
  resolveEntityPicks,
} from '../../utils/interactive/EntityPickers';
import { FrodoCommand } from '../FrodoCommand';

/**
 * The mapping skeleton type isn't exported from frodo-lib's root; derive
 * it from the read function instead of importing an unexported name.
 */
type MappingSkeleton = Awaited<
  ReturnType<typeof frodo.idm.mapping.readMappings>
>[number];

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
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
    .requireOneOf({ options: ['all', 'mappingId'], purpose: 'what to delete' })
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
        // --all -a, or an interactive pick (resolveEntityPicks is a no-op
        // outside the prompt gate, so a non-interactive run with neither
        // option never reaches deleteMappings here -- same as before
        // Phase 3, where the error branch below handled that case).
        else if (
          (options.all ||
            (await resolveEntityPicks(command, [
              entityPick<MappingSkeleton>({
                name: 'mappingId',
                kind: 'mapping',
                load: () =>
                  frodo.idm.mapping.readMappings(
                    options.connectorId,
                    options.managedObjectType
                  ),
                label: (mapping) => mapping.displayName || mapping.name,
                description: (mapping) => mapping._id ?? '',
              }),
            ]))) &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          if (options.mappingId) {
            verboseMessage(`Deleting mapping ${options.mappingId}...`);
            const outcome = await deleteMapping(options.mappingId);
            if (!outcome) process.exitCode = 1;
          } else {
            verboseMessage(`Deleting all mappings...`);
            const outcome = await deleteMappings(
              options.connectorId,
              options.managedObjectType
            );
            if (!outcome) process.exitCode = 1;
          }
        }
        // No branch ran: with requireOneOf satisfied, the only ways here
        // are getTokens() failing (keep the old exit-1 semantics) or the
        // user escaping the entity picker (declined to run).
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
