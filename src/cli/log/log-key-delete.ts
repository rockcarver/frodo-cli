import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { deleteLogApiKey, deleteLogApiKeys } from '../../ops/LogOps';
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
    .requireOneOf({ options: ['all', 'keyId'], purpose: 'what to delete' })
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
        // delete by id
        if (options.keyId && (await getTokens(true, true, deploymentTypes))) {
          verboseMessage(`Deleting key ${options.keyId}`);
          deleteLogApiKey(options.keyId);
        }
        // --all -a
        else if (
          options.all &&
          (await getTokens(true, true, deploymentTypes))
        ) {
          verboseMessage('Deleting keys...');
          deleteLogApiKeys();
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
