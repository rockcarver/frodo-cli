import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { deleteLogApiKey, deleteLogApiKeys } from '../../ops/LogOps';
import { printMessage, verboseMessage } from '../../utils/Console';
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
