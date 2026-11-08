import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteMapping, deleteMappings } from '../../ops/MappingOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import { printMessage, verboseMessage } from '../../utils/Console';
import {
  deferEntityPicks,
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

/**
 * Deleting the mappings of one connector or managed object type is disabled
 * until frodo-lib#948 is fixed and pinned: with a filter the library deletes all
 * new-style mappings, not only the matching ones.
 */
const FILTERED_DELETE_DISABLED =
  'Deleting the mappings of one connector or managed object type is disabled for now: with -c/--connector-id or -t/--managed-object-type the library deletes all new-style mappings, not only the matching ones (https://github.com/rockcarver/frodo-lib/issues/948). Delete all mappings with -a, or one mapping with -i.';

/**
 * Refuses a delete that would go through the filtered branch of the library.
 * @param {object} options the parsed options
 * @returns {boolean} false, after printing the error, if the delete is refused
 */
function checkNoFilter(options: {
  connectorId?: string;
  managedObjectType?: string;
}): boolean {
  if (!options.connectorId && !options.managedObjectType) return true;
  printMessage(FILTERED_DELETE_DISABLED, 'error');
  return false;
}

export default function setup() {
  const program = new FrodoCommand('frodo mapping delete', [], deploymentTypes);

  program
    .description('Delete IDM mappings.')
    .addOption(
      new Option(
        '-i, --mapping-id <mapping-id>',
        'Mapping id. Cannot be used with -a.'
      ).conflicts(['connectorId', 'managedObjectType', 'all'])
    )
    .addOption(
      new Option(
        '-c, --connector-id <connector-id>',
        'Connector id. Limits the mappings offered when picking one. Deleting all mappings of a connector is disabled for now: https://github.com/rockcarver/frodo-lib/issues/948. Cannot be used with -i.'
      ).conflicts(['mappingId'])
    )
    .addOption(
      new Option(
        '-t, --managed-object-type <managed-object-type>',
        'Managed object type. Limits the mappings offered when picking one. Deleting all mappings of a type is disabled for now: https://github.com/rockcarver/frodo-lib/issues/948. Cannot be used with -i.'
      ).conflicts(['mappingId'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all mappings. Cannot be used with -i.'
      ).conflicts(['mappingId'])
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all mappings. Required with -a when there is no terminal.'
      )
    )
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
        // the filtered bulk delete is disabled (frodo-lib#948), refused before
        // the login and before any question
        if (options.all && !checkNoFilter(options)) {
          process.exitCode = 1;
          return;
        }
        // a run that nobody can be asked about is refused before the login
        // (cli record 0037)
        if (
          options.all &&
          !checkBulkDelete({
            what: 'all mappings',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }
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
        // (the error branch below handled that case in the pre-picker layout).
        else if (
          (options.all || (await resolveEntityPicks(command))) &&
          (await getTokens(false, true, deploymentTypes))
        ) {
          if (options.mappingId) {
            verboseMessage(`Deleting mapping ${options.mappingId}...`);
            const outcome = await deleteMapping(options.mappingId);
            if (!outcome) process.exitCode = 1;
          } else {
            // only -a with a filter reaches here with one, and was refused
            // above; this keeps any other way in from the filtered delete
            if (!checkNoFilter(options)) {
              process.exitCode = 1;
              return;
            }
            if (
              !(await confirmBulkDelete({
                what: 'all mappings',
                yes: options.yes,
                dryRunAvailable: false,
              }))
            ) {
              process.exitCode = 1;
              return;
            }
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

  deferEntityPicks(program, [
    // The loader reads the option values at pick time, so -c/--connector-id
    // and -t/--managed-object-type still scope the dropdown.
    entityPick<MappingSkeleton>({
      name: 'mappingId',
      kind: 'mapping',
      scopedBy: ['connectorId', 'managedObjectType'],
      load: () =>
        frodo.idm.mapping.readMappings(
          program.getOptionValue('connectorId'),
          program.getOptionValue('managedObjectType')
        ),
      label: (mapping) => mapping.displayName || mapping.name,
      description: (mapping) => mapping._id ?? '',
    }),
  ]);

  return program;
}
