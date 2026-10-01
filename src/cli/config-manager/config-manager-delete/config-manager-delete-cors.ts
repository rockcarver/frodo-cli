import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteCors } from '../../../configManagerOps/FrConfigCorsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import { printMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager delete cors',
    [],
    deploymentTypes
  );

  program
    .description('Delete CORS configuration.')
    .addOption(
      new Option(
        '-n, --name <cors name>',
        'Delete cors from specified name/id, without the type prefix.'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Show which CORS configurations would be deleted without deleting them.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all CORS configurations. Required without a terminal.'
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

      const named = options.name !== undefined;

      if (named && options.name.trim() === '') {
        printMessage(
          'The CORS name must not be empty. To delete all CORS configurations, leave out the name.',
          'error'
        );
        process.exitCode = 1;
        return;
      }

      const what = 'all CORS configurations';

      if (
        !named &&
        !checkBulkDelete({
          what,
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

      if (
        !named &&
        !options.dryRun &&
        !(await confirmBulkDelete({
          what,
          yes: options.yes,
          dryRun: false,
        }))
      ) {
        process.exitCode = 1;
        return;
      }

      printMessage(
        named
          ? `Deleting CORS configuration: "${options.name}"`
          : 'Deleting all CORS configurations.'
      );

      const outcome = await configManagerDeleteCors(
        options.name,
        options.dryRun,
        options.allowFailures
      );

      if (!outcome) {
        process.exitCode = 1;
      }
    });

  return program;
}
