import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteMappings } from '../../../configManagerOps/FrConfigConnectorMappingOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete connector-mappings',
    [],
    deploymentTypes
  );

  program
    .description('Delete connector mappings.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Specifies the name to delete from the connector mapping.'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which connector mappings to delete first.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting mass connector mappings. Required without a terminal.'
      )
    )
    .multiOp()

    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      // Refuse bulk deletion if confirmation is not possible
      if (
        !options.name &&
        !checkBulkDelete({
          what: 'all connector mappings',
          yes: options.yes,
          dryRun: options.dryRun,
        })
      ) {
        process.exitCode = 1;
        return;
      }

      const getTokensIsSuccessful = await getTokens(
        false,
        true,
        deploymentTypes
      );

      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }

      // Confirm bulk deletion
      if (
        !options.name &&
        !(await confirmBulkDelete({
          what: 'all connector mappings',
          yes: options.yes,
          dryRun: options.dryRun,
          showPlan: () => configManagerDeleteMappings(undefined, true),
        }))
      ) {
        process.exitCode = 1;
        return;
      }

      verboseMessage(
        `${options.dryRun ? 'Dry run: ' : ''}Deleting connector mappings${
          options.name ? ` with name ${options.name}` : ''
        }`
      );

      const outcome = await configManagerDeleteMappings(
        options.name,
        options.dryRun,
        options.allowFailures
      );

      if (!outcome) process.exitCode = 1;
    });

  return program;
}
