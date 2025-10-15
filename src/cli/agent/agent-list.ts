import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { listAgents } from '../../ops/AgentOps.js';
import { getTokens } from '../../ops/AuthenticateOps';
import { FrodoCommand } from '../FrodoCommand';

const { CLASSIC_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const globalDeploymentTypes = [CLASSIC_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo agent list',
    [],
    globalDeploymentTypes
  );

  program
    .description('List agents.')
    .addOption(
      new Option('-l, --long', 'Long with all fields.').default(false, 'false')
    )
    .addOption(new Option('-g, --global', 'List global agents.'))
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
        if (
          await getTokens(
            false,
            true,
            options.global ? globalDeploymentTypes : undefined
          )
        ) {
          const outcome = await listAgents(options.long, options.global);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
