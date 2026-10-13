import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerDeleteServices } from '../../../configManagerOps/FrConfigServiceOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../../utils/BulkDeleteGuard';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { DEFAULT_REALM_KEY } = frodo.utils.constants;

export default function setup() {
  const program = new FrodoCommand('frodo config-manager delete services');

  program
    .description('Delete authentication services.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Service name. If specified, only the given service is deleted.'
      )
    )
    .addOption(
      new Option(
        '-d, --dry-run',
        'Preview service deletion without deleting services.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting more than one service (no -n). Required without a terminal.'
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
      const what = 'all services';

      if (
        !named &&
        !checkBulkDelete({ what, yes: options.yes, dryRun: options.dryRun })
      ) {
        process.exitCode = 1;
        return;
      }

      if (named && options.name.trim() === '') {
        printMessage('Service name must not be empty.', 'error');
        process.exitCode = 1;
        return;
      }

      if (options.name && (!realm || realm === DEFAULT_REALM_KEY)) {
        printMessage(
          'The -n/--name option requires a realm argument to be specified.',
          'error'
        );
        process.exitCode = 1;
        program.help();
        return;
      }

      if (await getTokens()) {
        if (
          !named &&
          !(await confirmBulkDelete({
            what,
            yes: options.yes,
            dryRun: options.dryRun,
          }))
        ) {
          process.exitCode = 1;
          return;
        }
        verboseMessage('Deleting services');
        const outcome = await configManagerDeleteServices(
          options.name,
          options.dryRun,
          realm,
          options.allowFailures
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
