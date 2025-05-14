import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { listSecrets } from '../../ops/cloud/SecretsOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo esv secret list',
    ['realm'],
    deploymentTypes
  );

  program
    .description('List secrets.')
    .addOption(
      new Option('-l, --long', 'Long with all fields besides usage.').default(
        false,
        'false'
      )
    )
    .addOption(
      new Option(
        '-u, --usage',
        'Display usage field. If a file is provided with -f or --file, it will search for usage in the file. If a directory is provided with -D or --directory, it will search for usage in all .json files in the directory and sub-directories. If no file or directory is provided, it will perform a full export automatically to determine usage.'
      ).default(false, 'false')
    )
    .addOption(
      new Option(
        '-f, --file [file]',
        'Optional export file to use to determine usage. Overrides -D, --directory. Only used if -u or --usage is provided as well.'
      )
    )
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
        if (await getTokens(false, true, deploymentTypes)) {
          verboseMessage('Listing secrets...');
          const outcome = await listSecrets(
            options.long,
            options.usage,
            options.file
          );
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
