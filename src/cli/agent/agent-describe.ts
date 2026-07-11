import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { describeAgent, describeAgents } from '../../ops/AgentOps.js';
import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLASSIC_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const globalDeploymentTypes = [CLASSIC_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand('frodo agent describe');

  program
    .description('Describe agents.')
    .addOption(new Option('-i, --agent-id <agent-id>', 'Agent id.'))
    .addOption(new Option('-g, --global', 'Describe global agent.'))
    .addOption(new Option('--json', 'Output in JSON format.'))
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
          // describe single agent
          if (options.agentId) {
            const description = await describeAgent(
              options.agentId,
              options.global,
              options.json
            );
            printMessage(description, 'data');
          }
          // describe all agents
          else {
            const description = await describeAgents(
              options.global,
              options.json
            );
            printMessage(description, 'data');
          }
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
