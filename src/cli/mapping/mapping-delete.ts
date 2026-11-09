import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteMapping, deleteMappings } from '../../ops/MappingOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

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
        'Mapping id. Cannot be used with -a.'
      ).conflicts(['connectorId', 'managedObjectType', 'all'])
    )
    .addOption(
      new Option(
        '-c, --connector-id <connector-id>',
        'Connector id. If specified, limits mappings to that particular connector; Cannot be used with -i.'
      ).conflicts(['mappingId'])
    )
    .addOption(
      new Option(
        '-t, --managed-object-type <managed-object-type>',
        'Managed object type. If specified, limits mappings to that particular managed object type. Cannot be used with -i.'
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
    .multiOp()
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
        // The family's picker (record 0038) has run inside getTokens when -i was
        // missing on a terminal, narrowed by -c and -t; a declined pick or a
        // failed load ends up in the else below, like a failed login.
        if (await getTokens(false, true, deploymentTypes)) {
          // delete by id/name
          if (options.mappingId) {
            verboseMessage(`Deleting mapping ${options.mappingId}...`);
            const outcome = await deleteMapping(options.mappingId);
            if (!outcome) process.exitCode = 1;
          }
          // --all -a
          else if (options.all) {
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
              options.managedObjectType,
              options.allowFailures
            );
            if (!outcome) process.exitCode = 1;
          }
          // Neither was given and the pick found no mapping (an empty list counts
          // as satisfied): there is nothing to delete, and nothing to confirm.
          else {
            printMessage('No mappings found to delete.');
          }
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
