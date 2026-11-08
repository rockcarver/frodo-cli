import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteLogApiKey, deleteLogApiKeys } from '../../ops/LogOps';
import {
  checkBulkDelete,
  confirmBulkDelete,
} from '../../utils/BulkDeleteGuard';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo log key delete',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Delete log API keys.')
    .addOption(
      new Option('-i, --key-id <key-id>', 'Key id. Regex if specified with -a.')
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all keys. Optionally specify regex filter -i.'
      )
    )
    .addOption(
      new Option(
        '-y, --yes',
        'Do not ask for confirmation before deleting all log API keys. Required with -a when there is no terminal.'
      )
    )
    .requireOneOf({ options: ['all', 'keyId'], purpose: 'what to delete' })
    .multiOp()
    .action(
      // implement command logic inside action handler
      async (host, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
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
            what: 'all log API keys',
            yes: options.yes,
            dryRunAvailable: false,
          })
        ) {
          process.exitCode = 1;
          return;
        }
        // delete by id
        if (options.keyId && (await getTokens(true, true, deploymentTypes))) {
          verboseMessage(`Deleting key ${options.keyId}`);
          // the outcome decides the exit code (it was not awaited, so a failed
          // delete exited 0)
          const outcome = await deleteLogApiKey(options.keyId);
          if (!outcome) process.exitCode = 1;
        }
        // --all -a
        else if (
          options.all &&
          (await getTokens(true, true, deploymentTypes))
        ) {
          if (
            !(await confirmBulkDelete({
              what: 'all log API keys',
              yes: options.yes,
              dryRunAvailable: false,
            }))
          ) {
            process.exitCode = 1;
            return;
          }
          verboseMessage('Deleting keys...');
          const outcome = await deleteLogApiKeys(options.allowFailures);
          if (!outcome) process.exitCode = 1;
        }
        // No branch ran: with requireOneOf satisfied, the only way
        // here is getTokens() failing -- keep the old exit-1 semantics
        // (the removed else handled auth failure too).
        else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
