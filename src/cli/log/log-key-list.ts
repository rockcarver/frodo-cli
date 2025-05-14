import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { listLogApiKeys } from '../../ops/LogOps';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo log key list',
    ['realm'],
    deploymentTypes
  );

  program
    .description('List log API keys.')
    .addOption(
      new Option('-l, --long', 'Long with all fields.').default(false, 'false')
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
        if (await getTokens(true, true, deploymentTypes)) {
          verboseMessage(`Listing log API keys...`);
          const outcome = await listLogApiKeys(options.long);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
